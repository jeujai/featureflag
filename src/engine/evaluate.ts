import type {
  Clause,
  FeatureFlagConfig,
  EvaluationContext,
  EvaluationResult,
  EvaluationReason,
  FlagValue,
  Segment,
  TargetingRule,
} from "../shared/types.js";

// ---------------------------------------------------------------------------
// MurmurHash3 (32-bit) – pure TypeScript implementation
// ---------------------------------------------------------------------------

/**
 * MurmurHash3 32-bit implementation.
 * Based on the original C++ reference by Austin Appleby.
 * All arithmetic is kept within 32-bit range using Math.imul and >>> 0.
 */
export function murmurhash3_32(key: string, seed: number = 0): number {
  const len = key.length;
  let h = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  // Process 4-byte chunks
  const nblocks = len >> 2;
  for (let i = 0; i < nblocks; i++) {
    let k =
      (key.charCodeAt(i * 4) & 0xff) |
      ((key.charCodeAt(i * 4 + 1) & 0xff) << 8) |
      ((key.charCodeAt(i * 4 + 2) & 0xff) << 16) |
      ((key.charCodeAt(i * 4 + 3) & 0xff) << 24);

    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }

  // Process remaining bytes
  const tail = nblocks * 4;
  let k1 = 0;
  switch (len & 3) {
    case 3:
      k1 ^= (key.charCodeAt(tail + 2) & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (key.charCodeAt(tail + 1) & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= key.charCodeAt(tail) & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h ^= k1;
  }

  // Finalization mix
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}

/**
 * Returns true when every clause in the rule matches the given context.
 * AND logic: all clauses must match. Empty clauses → matches everything.
 */
export function matchesRule(
  rule: TargetingRule,
  context: EvaluationContext,
  segments: Map<string, Segment>,
): boolean {
  if (!rule.clauses || rule.clauses.length === 0) {
    return true;
  }
  return rule.clauses.every((clause) => matchesClause(clause, context, segments));
}

/**
 * Evaluate a single clause against the context.
 * For segmentMatch, clause.values are segment keys — context matches if ANY
 * of those segments match (OR logic). Within each segment rule, ALL clauses
 * must match (AND logic). Segment clauses never recurse into segments again.
 */
export function matchesClause(
  clause: Clause,
  context: EvaluationContext,
  segments: Map<string, Segment>,
  _insideSegment = false,
): boolean {
  // segmentMatch is special — doesn't use a context attribute directly
  if (clause.operator === "segmentMatch") {
    const result = matchesSegment(clause, context, segments);
    return clause.negate ? !result : result;
  }

  const contextValue = context[clause.attribute];
  const result = applyOperator(clause.operator, contextValue, clause.values);
  return clause.negate ? !result : result;
}

/** Check if context matches ANY of the referenced segments (OR logic). */
function matchesSegment(
  clause: Clause,
  context: EvaluationContext,
  segments: Map<string, Segment>,
): boolean {
  const segmentKeys = clause.values as string[];
  return segmentKeys.some((segKey) => {
    const segment = segments.get(segKey);
    if (!segment) return false;
    // OR between segment rules
    return segment.rules.some((segRule) => {
      // AND between clauses within a segment rule
      if (!segRule.clauses || segRule.clauses.length === 0) return true;
      return segRule.clauses.every((segClause) => {
        // Prevent infinite recursion: segmentMatch inside a segment is ignored
        if (segClause.operator === "segmentMatch") return false;
        const cv = context[segClause.attribute];
        const res = applyOperator(segClause.operator, cv, segClause.values);
        return segClause.negate ? !res : res;
      });
    });
  });
}

/** Apply a clause operator to a context value against the clause's values list. */
function applyOperator(
  operator: string,
  contextValue: unknown,
  clauseValues: unknown[],
): boolean {
  switch (operator) {
    case "eq":
      // context value equals ANY of clause.values
      return clauseValues.some((v) => contextValue === v);

    case "neq":
      // context value does not equal ANY of clause.values
      return clauseValues.every((v) => contextValue !== v);

    case "contains": {
      if (typeof contextValue !== "string") return false;
      return clauseValues.some(
        (v) => typeof v === "string" && contextValue.includes(v),
      );
    }

    case "startsWith": {
      if (typeof contextValue !== "string") return false;
      return clauseValues.some(
        (v) => typeof v === "string" && contextValue.startsWith(v),
      );
    }

    case "endsWith": {
      if (typeof contextValue !== "string") return false;
      return clauseValues.some(
        (v) => typeof v === "string" && contextValue.endsWith(v),
      );
    }

    case "in":
      // context value is in clause.values array
      return clauseValues.includes(contextValue);

    default:
      return false;
  }
}

/**
 * Deterministic hash of (userKey, flagKey, salt) → bucket in [0, 99999].
 * Uses MurmurHash3 (32-bit) for fast, well-distributed hashing.
 * The hash input is `${userKey}.${flagKey}.${salt}` concatenated.
 * Returns a value in [0, 99999] (100k buckets for 0.001% granularity).
 */
export function computeRolloutBucket(
  userKey: string,
  flagKey: string,
  salt: string,
): number {
  const hashInput = `${userKey}.${flagKey}.${salt}`;
  const hash = murmurhash3_32(hashInput, 0);
  return hash % 100000;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely resolve a variation value by index, returning null if out of bounds. */
function resolveVariation(
  flagConfig: FeatureFlagConfig,
  variationIndex: number,
): FlagValue | undefined {
  const variation = flagConfig.flag.variations[variationIndex];
  return variation?.value;
}

/** Build an error result (the engine never throws). */
function errorResult(errorKind: string): EvaluationResult {
  return { value: null, variationIndex: -1, reason: { kind: "ERROR", errorKind } };
}

// ---------------------------------------------------------------------------
// Core evaluate
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic flag evaluation.
 *
 * 1. If the flag is disabled → off variation with reason OFF.
 * 2. Targeting rules sorted by priority (lowest first); first match wins.
 *    - "single" rollout  → TARGET_MATCH
 *    - "percentage" rollout → ROLLOUT (bucket resolved via computeRolloutBucket)
 * 3. No rule matches → default variation with reason DEFAULT.
 * 4. Any error → ERROR reason (never throws).
 */
export function evaluate(
  flagConfig: FeatureFlagConfig,
  context: EvaluationContext,
  segments: Map<string, Segment>,
): EvaluationResult {
  try {
    // --- Validate inputs ------------------------------------------------
    if (!flagConfig?.flag || !flagConfig?.config) {
      return errorResult("MALFORMED_FLAG");
    }

    if (!context || typeof context.key !== "string" || context.key === "") {
      return errorResult("INVALID_CONTEXT");
    }

    const { flag, config } = flagConfig;

    if (!Array.isArray(flag.variations) || flag.variations.length === 0) {
      return errorResult("MALFORMED_FLAG");
    }

    // --- Flag disabled → off variation ----------------------------------
    if (!config.enabled) {
      const offValue = resolveVariation(flagConfig, config.offVariationIndex);
      if (offValue === undefined) {
        return errorResult("MALFORMED_FLAG");
      }
      return {
        value: offValue,
        variationIndex: config.offVariationIndex,
        reason: { kind: "OFF" },
      };
    }

    // --- Evaluate targeting rules in priority order ----------------------
    const sortedRules = [...config.targetingRules].sort(
      (a, b) => a.priority - b.priority,
    );

    for (const rule of sortedRules) {
      if (!matchesRule(rule, context, segments)) {
        continue;
      }

      // Rule matched – resolve via rollout
      const reason = resolveReason(rule, sortedRules);

      if (rule.rollout.kind === "single") {
        const idx = rule.rollout.variationIndex;
        const value = resolveVariation(flagConfig, idx);
        if (value === undefined) {
          return errorResult("MALFORMED_FLAG");
        }
        return { value, variationIndex: idx, reason };
      }

      if (rule.rollout.kind === "percentage") {
        const bucket = computeRolloutBucket(
          context.key,
          flag.key,
          flag.id, // salt
        );
        const idx = bucketToVariationIndex(rule.rollout.buckets, bucket);
        if (idx === -1) {
          return errorResult("MALFORMED_FLAG");
        }
        const value = resolveVariation(flagConfig, idx);
        if (value === undefined) {
          return errorResult("MALFORMED_FLAG");
        }
        return { value, variationIndex: idx, reason };
      }

      // Unknown rollout kind – treat as error
      return errorResult("MALFORMED_FLAG");
    }

    // --- No rule matched → default variation ----------------------------
    const defaultValue = resolveVariation(flagConfig, config.defaultVariationIndex);
    if (defaultValue === undefined) {
      return errorResult("MALFORMED_FLAG");
    }
    return {
      value: defaultValue,
      variationIndex: config.defaultVariationIndex,
      reason: { kind: "DEFAULT" },
    };
  } catch {
    return errorResult("UNEXPECTED_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a bucket value [0, 99999] to a variation index using cumulative weights. */
function bucketToVariationIndex(
  buckets: { variationIndex: number; weight: number }[],
  bucket: number,
): number {
  let cumulative = 0;
  for (const b of buckets) {
    cumulative += b.weight;
    if (bucket < cumulative) {
      return b.variationIndex;
    }
  }
  // Bucket falls outside total weight – malformed config
  return -1;
}

/** Determine the evaluation reason for a matched rule. */
function resolveReason(
  rule: TargetingRule,
  sortedRules: TargetingRule[],
): EvaluationReason {
  const ruleIndex = sortedRules.indexOf(rule);
  if (rule.rollout.kind === "percentage") {
    return { kind: "ROLLOUT", ruleIndex };
  }
  return { kind: "TARGET_MATCH", ruleIndex };
}
