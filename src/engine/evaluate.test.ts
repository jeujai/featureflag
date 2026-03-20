import { describe, it, expect } from "vitest";
import { evaluate, matchesRule, matchesClause, computeRolloutBucket, murmurhash3_32 } from "./evaluate.js";
import type {
  Clause,
  FeatureFlagConfig,
  EvaluationContext,
  Segment,
  TargetingRule,
} from "../shared/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlag(overrides?: Partial<FeatureFlagConfig>): FeatureFlagConfig {
  return {
    flag: {
      id: "flag-1",
      projectId: "proj-1",
      key: "test-flag",
      name: "Test Flag",
      description: "",
      flagType: "boolean",
      variations: [
        { id: "v0", value: false, name: "Off" },
        { id: "v1", value: true, name: "On" },
      ],
      tags: [],
      clientSideAvailable: false,
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
      ...overrides?.flag,
    },
    config: {
      flagId: "flag-1",
      environmentId: "env-1",
      enabled: true,
      defaultVariationIndex: 0,
      offVariationIndex: 0,
      targetingRules: [],
      version: 1,
      ...overrides?.config,
    },
  };
}

const ctx: EvaluationContext = { key: "user-1" };
const emptySegments = new Map<string, Segment>();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluate – core behaviour", () => {
  it("returns off variation with OFF reason when flag is disabled", () => {
    const flag = makeFlag({ config: { enabled: false } as any });
    const result = evaluate(flag, ctx, emptySegments);

    expect(result.reason).toEqual({ kind: "OFF" });
    expect(result.variationIndex).toBe(0);
    expect(result.value).toBe(false);
  });

  it("returns off variation even when targeting rules exist but flag is disabled", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const flag = makeFlag({
      config: { enabled: false, targetingRules: [rule] } as any,
    });
    const result = evaluate(flag, ctx, emptySegments);

    expect(result.reason).toEqual({ kind: "OFF" });
    expect(result.value).toBe(false);
  });

  it("returns default variation with DEFAULT reason when no rules match", () => {
    const flag = makeFlag();
    const result = evaluate(flag, ctx, emptySegments);

    expect(result.reason).toEqual({ kind: "DEFAULT" });
    expect(result.variationIndex).toBe(0);
    expect(result.value).toBe(false);
  });

  it("returns default variation when enabled with empty targeting rules", () => {
    const flag = makeFlag({
      config: { enabled: true, defaultVariationIndex: 1 } as any,
    });
    const result = evaluate(flag, ctx, emptySegments);

    expect(result.reason).toEqual({ kind: "DEFAULT" });
    expect(result.variationIndex).toBe(1);
    expect(result.value).toBe(true);
  });
});

describe("evaluate – error handling", () => {
  it("returns ERROR for null flagConfig", () => {
    const result = evaluate(null as any, ctx, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "MALFORMED_FLAG" });
    expect(result.variationIndex).toBe(-1);
    expect(result.value).toBeNull();
  });

  it("returns ERROR for missing context key", () => {
    const flag = makeFlag();
    const result = evaluate(flag, {} as any, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "INVALID_CONTEXT" });
  });

  it("returns ERROR for empty string context key", () => {
    const flag = makeFlag();
    const result = evaluate(flag, { key: "" }, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "INVALID_CONTEXT" });
  });

  it("returns ERROR when offVariationIndex is out of bounds", () => {
    const flag = makeFlag({
      config: { enabled: false, offVariationIndex: 99 } as any,
    });
    const result = evaluate(flag, ctx, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "MALFORMED_FLAG" });
  });

  it("returns ERROR when defaultVariationIndex is out of bounds", () => {
    const flag = makeFlag({
      config: { enabled: true, defaultVariationIndex: 99 } as any,
    });
    const result = evaluate(flag, ctx, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "MALFORMED_FLAG" });
  });

  it("returns ERROR when flag has no variations", () => {
    const flag = makeFlag();
    flag.flag.variations = [];
    const result = evaluate(flag, ctx, emptySegments);
    expect(result.reason).toEqual({ kind: "ERROR", errorKind: "MALFORMED_FLAG" });
  });
});

describe("evaluate – determinism", () => {
  it("produces identical results for identical inputs", () => {
    const flag = makeFlag();
    const r1 = evaluate(flag, ctx, emptySegments);
    const r2 = evaluate(flag, ctx, emptySegments);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// matchesRule / matchesClause tests (task 2.2)
// ---------------------------------------------------------------------------

describe("matchesRule – AND logic", () => {
  it("matches when rule has no clauses (empty clauses = match all)", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: { kind: "single", variationIndex: 1 },
    };
    expect(matchesRule(rule, ctx, emptySegments)).toBe(true);
  });

  it("matches when all clauses match (AND)", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [
        { attribute: "country", operator: "eq", values: ["US"], negate: false },
        { attribute: "plan", operator: "eq", values: ["enterprise"], negate: false },
      ],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const context: EvaluationContext = { key: "u1", country: "US", plan: "enterprise" };
    expect(matchesRule(rule, context, emptySegments)).toBe(true);
  });

  it("does not match when any clause fails (AND)", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [
        { attribute: "country", operator: "eq", values: ["US"], negate: false },
        { attribute: "plan", operator: "eq", values: ["enterprise"], negate: false },
      ],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const context: EvaluationContext = { key: "u1", country: "US", plan: "free" };
    expect(matchesRule(rule, context, emptySegments)).toBe(false);
  });
});

describe("matchesClause – operators", () => {
  // eq
  it("eq: matches when context value equals one of clause values", () => {
    const clause: Clause = { attribute: "country", operator: "eq", values: ["US", "UK"], negate: false };
    expect(matchesClause(clause, { key: "u1", country: "US" }, emptySegments)).toBe(true);
    expect(matchesClause(clause, { key: "u1", country: "UK" }, emptySegments)).toBe(true);
  });

  it("eq: does not match when context value is not in clause values", () => {
    const clause: Clause = { attribute: "country", operator: "eq", values: ["US"], negate: false };
    expect(matchesClause(clause, { key: "u1", country: "CA" }, emptySegments)).toBe(false);
  });

  // neq
  it("neq: matches when context value does not equal any clause value", () => {
    const clause: Clause = { attribute: "country", operator: "neq", values: ["US", "UK"], negate: false };
    expect(matchesClause(clause, { key: "u1", country: "CA" }, emptySegments)).toBe(true);
  });

  it("neq: does not match when context value equals one of clause values", () => {
    const clause: Clause = { attribute: "country", operator: "neq", values: ["US", "UK"], negate: false };
    expect(matchesClause(clause, { key: "u1", country: "US" }, emptySegments)).toBe(false);
  });

  // contains
  it("contains: matches when string context value contains a clause value", () => {
    const clause: Clause = { attribute: "email", operator: "contains", values: ["@acme.com"], negate: false };
    expect(matchesClause(clause, { key: "u1", email: "jane@acme.com" }, emptySegments)).toBe(true);
  });

  it("contains: does not match for non-string context value", () => {
    const clause: Clause = { attribute: "count", operator: "contains", values: ["5"], negate: false };
    expect(matchesClause(clause, { key: "u1", count: 5 }, emptySegments)).toBe(false);
  });

  // startsWith
  it("startsWith: matches when string starts with a clause value", () => {
    const clause: Clause = { attribute: "email", operator: "startsWith", values: ["admin"], negate: false };
    expect(matchesClause(clause, { key: "u1", email: "admin@acme.com" }, emptySegments)).toBe(true);
  });

  it("startsWith: does not match when string does not start with any clause value", () => {
    const clause: Clause = { attribute: "email", operator: "startsWith", values: ["admin"], negate: false };
    expect(matchesClause(clause, { key: "u1", email: "user@acme.com" }, emptySegments)).toBe(false);
  });

  // endsWith
  it("endsWith: matches when string ends with a clause value", () => {
    const clause: Clause = { attribute: "email", operator: "endsWith", values: ["@acme.com"], negate: false };
    expect(matchesClause(clause, { key: "u1", email: "jane@acme.com" }, emptySegments)).toBe(true);
  });

  it("endsWith: does not match when string does not end with any clause value", () => {
    const clause: Clause = { attribute: "email", operator: "endsWith", values: ["@acme.com"], negate: false };
    expect(matchesClause(clause, { key: "u1", email: "jane@other.com" }, emptySegments)).toBe(false);
  });

  // in
  it("in: matches when context value is in clause values array", () => {
    const clause: Clause = { attribute: "platform", operator: "in", values: ["ios", "android"], negate: false };
    expect(matchesClause(clause, { key: "u1", platform: "ios" }, emptySegments)).toBe(true);
  });

  it("in: does not match when context value is not in clause values", () => {
    const clause: Clause = { attribute: "platform", operator: "in", values: ["ios", "android"], negate: false };
    expect(matchesClause(clause, { key: "u1", platform: "web" }, emptySegments)).toBe(false);
  });
});

describe("matchesClause – negate support", () => {
  it("negate inverts a matching eq clause to false", () => {
    const clause: Clause = { attribute: "country", operator: "eq", values: ["US"], negate: true };
    expect(matchesClause(clause, { key: "u1", country: "US" }, emptySegments)).toBe(false);
  });

  it("negate inverts a non-matching eq clause to true", () => {
    const clause: Clause = { attribute: "country", operator: "eq", values: ["US"], negate: true };
    expect(matchesClause(clause, { key: "u1", country: "CA" }, emptySegments)).toBe(true);
  });
});

describe("matchesClause – segmentMatch", () => {
  const betaSegment: Segment = {
    id: "seg-1",
    projectId: "proj-1",
    key: "beta-users",
    name: "Beta Users",
    rules: [
      {
        clauses: [
          { attribute: "plan", operator: "eq", values: ["enterprise"], negate: false },
        ],
      },
      {
        clauses: [
          { attribute: "email", operator: "endsWith", values: ["@acme.com"], negate: false },
        ],
      },
    ],
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  };

  const segments = new Map<string, Segment>([["beta-users", betaSegment]]);

  it("matches when context matches any segment rule (OR logic)", () => {
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["beta-users"], negate: false };
    // Matches first rule (plan=enterprise)
    expect(matchesClause(clause, { key: "u1", plan: "enterprise" }, segments)).toBe(true);
    // Matches second rule (email endsWith @acme.com)
    expect(matchesClause(clause, { key: "u2", email: "jane@acme.com" }, segments)).toBe(true);
  });

  it("does not match when context matches no segment rule", () => {
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["beta-users"], negate: false };
    expect(matchesClause(clause, { key: "u3", plan: "free", email: "user@other.com" }, segments)).toBe(false);
  });

  it("does not match when segment key is not found", () => {
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["nonexistent"], negate: false };
    expect(matchesClause(clause, { key: "u1" }, segments)).toBe(false);
  });

  it("negate inverts segmentMatch result", () => {
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["beta-users"], negate: true };
    // Would match without negate, so with negate → false
    expect(matchesClause(clause, { key: "u1", plan: "enterprise" }, segments)).toBe(false);
    // Would not match without negate, so with negate → true
    expect(matchesClause(clause, { key: "u3", plan: "free" }, segments)).toBe(true);
  });

  it("segment rule with AND logic: all clauses must match within a rule", () => {
    const strictSegment: Segment = {
      id: "seg-2",
      projectId: "proj-1",
      key: "strict-segment",
      name: "Strict",
      rules: [
        {
          clauses: [
            { attribute: "country", operator: "eq", values: ["US"], negate: false },
            { attribute: "plan", operator: "eq", values: ["enterprise"], negate: false },
          ],
        },
      ],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    const segs = new Map<string, Segment>([["strict-segment", strictSegment]]);
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["strict-segment"], negate: false };

    // Both match → true
    expect(matchesClause(clause, { key: "u1", country: "US", plan: "enterprise" }, segs)).toBe(true);
    // Only one matches → false
    expect(matchesClause(clause, { key: "u2", country: "US", plan: "free" }, segs)).toBe(false);
  });

  it("segmentMatch inside a segment does not recurse (returns false)", () => {
    const recursiveSegment: Segment = {
      id: "seg-3",
      projectId: "proj-1",
      key: "recursive-seg",
      name: "Recursive",
      rules: [
        {
          clauses: [
            { attribute: "", operator: "segmentMatch", values: ["recursive-seg"], negate: false },
          ],
        },
      ],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    const segs = new Map<string, Segment>([["recursive-seg", recursiveSegment]]);
    const clause: Clause = { attribute: "", operator: "segmentMatch", values: ["recursive-seg"], negate: false };

    // Should not recurse infinitely — segmentMatch inside segment returns false
    expect(matchesClause(clause, { key: "u1" }, segs)).toBe(false);
  });
});

describe("evaluate – targeting rule matching integration", () => {
  it("returns matched variation when a targeting rule matches", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [
        { attribute: "key", operator: "in", values: ["user-1", "user-2"], negate: false },
      ],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });
    const result = evaluate(flag, { key: "user-1" }, emptySegments);

    expect(result.value).toBe(true);
    expect(result.variationIndex).toBe(1);
    expect(result.reason).toEqual({ kind: "TARGET_MATCH", ruleIndex: 0 });
  });

  it("returns default when targeting rule does not match", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [
        { attribute: "key", operator: "in", values: ["user-99"], negate: false },
      ],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });
    const result = evaluate(flag, { key: "user-1" }, emptySegments);

    expect(result.reason).toEqual({ kind: "DEFAULT" });
    expect(result.variationIndex).toBe(0);
  });

  it("first matching rule wins (priority order)", () => {
    const rules: TargetingRule[] = [
      {
        id: "r1",
        priority: 1,
        clauses: [{ attribute: "country", operator: "eq", values: ["US"], negate: false }],
        rollout: { kind: "single", variationIndex: 0 },
      },
      {
        id: "r2",
        priority: 0,
        clauses: [{ attribute: "key", operator: "eq", values: ["user-1"], negate: false }],
        rollout: { kind: "single", variationIndex: 1 },
      },
    ];
    const flag = makeFlag({ config: { targetingRules: rules } as any });
    // Both rules match, but r2 has lower priority number → evaluated first
    const result = evaluate(flag, { key: "user-1", country: "US" }, emptySegments);

    expect(result.variationIndex).toBe(1);
    expect(result.reason).toEqual({ kind: "TARGET_MATCH", ruleIndex: 0 });
  });

  it("segment-based targeting works end-to-end", () => {
    const segment: Segment = {
      id: "seg-1",
      projectId: "proj-1",
      key: "beta-users",
      name: "Beta",
      rules: [
        { clauses: [{ attribute: "plan", operator: "eq", values: ["enterprise"], negate: false }] },
      ],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    const segs = new Map<string, Segment>([["beta-users", segment]]);

    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [
        { attribute: "", operator: "segmentMatch", values: ["beta-users"], negate: false },
      ],
      rollout: { kind: "single", variationIndex: 1 },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    const matched = evaluate(flag, { key: "u1", plan: "enterprise" }, segs);
    expect(matched.variationIndex).toBe(1);

    const notMatched = evaluate(flag, { key: "u2", plan: "free" }, segs);
    expect(notMatched.reason).toEqual({ kind: "DEFAULT" });
  });
});

// ---------------------------------------------------------------------------
// computeRolloutBucket / MurmurHash3 tests (task 2.3)
// ---------------------------------------------------------------------------

describe("murmurhash3_32", () => {
  it("returns a 32-bit unsigned integer", () => {
    const hash = murmurhash3_32("hello", 0);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(hash)).toBe(true);
  });

  it("is deterministic: same input always produces same output", () => {
    const a = murmurhash3_32("test-key.flag-key.salt", 0);
    const b = murmurhash3_32("test-key.flag-key.salt", 0);
    expect(a).toBe(b);
  });

  it("different inputs produce different hashes", () => {
    const h1 = murmurhash3_32("input-a", 0);
    const h2 = murmurhash3_32("input-b", 0);
    expect(h1).not.toBe(h2);
  });
});

describe("computeRolloutBucket – determinism and range", () => {
  it("is deterministic: same inputs always produce the same bucket", () => {
    const b1 = computeRolloutBucket("user-1", "flag-1", "salt-1");
    const b2 = computeRolloutBucket("user-1", "flag-1", "salt-1");
    expect(b1).toBe(b2);
  });

  it("returns a value in [0, 99999]", () => {
    // Test with many different inputs to verify range
    for (let i = 0; i < 200; i++) {
      const bucket = computeRolloutBucket(`user-${i}`, "flag-key", "salt");
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(99999);
      expect(Number.isInteger(bucket)).toBe(true);
    }
  });

  it("different user keys produce different buckets (distribution)", () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 100; i++) {
      buckets.add(computeRolloutBucket(`user-${i}`, "flag-1", "salt-1"));
    }
    // With 100 users across 100k buckets, we expect nearly all unique
    expect(buckets.size).toBeGreaterThan(90);
  });

  it("different flag keys produce different buckets for the same user", () => {
    const b1 = computeRolloutBucket("user-1", "flag-a", "salt");
    const b2 = computeRolloutBucket("user-1", "flag-b", "salt");
    expect(b1).not.toBe(b2);
  });

  it("different salts produce different buckets for the same user and flag", () => {
    const b1 = computeRolloutBucket("user-1", "flag-1", "salt-a");
    const b2 = computeRolloutBucket("user-1", "flag-1", "salt-b");
    expect(b1).not.toBe(b2);
  });
});

describe("evaluate – percentage rollout integration", () => {
  it("resolves percentage rollout using computeRolloutBucket", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [], // matches everyone
      rollout: {
        kind: "percentage",
        buckets: [
          { variationIndex: 0, weight: 50000 }, // 50%
          { variationIndex: 1, weight: 50000 }, // 50%
        ],
      },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    const result = evaluate(flag, { key: "user-1" }, emptySegments);
    expect(result.reason).toEqual({ kind: "ROLLOUT", ruleIndex: 0 });
    expect([0, 1]).toContain(result.variationIndex);
    expect([true, false]).toContain(result.value);
  });

  it("percentage rollout is deterministic for the same user", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: {
        kind: "percentage",
        buckets: [
          { variationIndex: 0, weight: 50000 },
          { variationIndex: 1, weight: 50000 },
        ],
      },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    const r1 = evaluate(flag, { key: "user-42" }, emptySegments);
    const r2 = evaluate(flag, { key: "user-42" }, emptySegments);
    expect(r1).toEqual(r2);
  });

  it("percentage rollout distributes users across variations", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: {
        kind: "percentage",
        buckets: [
          { variationIndex: 0, weight: 50000 },
          { variationIndex: 1, weight: 50000 },
        ],
      },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    let count0 = 0;
    let count1 = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const result = evaluate(flag, { key: `user-${i}` }, emptySegments);
      if (result.variationIndex === 0) count0++;
      else count1++;
    }

    // With 50/50 split and 1000 users, each should be roughly 500 ± 100
    expect(count0).toBeGreaterThan(350);
    expect(count0).toBeLessThan(650);
    expect(count1).toBeGreaterThan(350);
    expect(count1).toBeLessThan(650);
  });

  it("100% rollout to one variation always returns that variation", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: {
        kind: "percentage",
        buckets: [
          { variationIndex: 1, weight: 100000 }, // 100%
        ],
      },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    for (let i = 0; i < 50; i++) {
      const result = evaluate(flag, { key: `user-${i}` }, emptySegments);
      expect(result.variationIndex).toBe(1);
      expect(result.value).toBe(true);
    }
  });

  it("returns ERROR for malformed percentage rollout (weights don't cover bucket)", () => {
    const rule: TargetingRule = {
      id: "r1",
      priority: 0,
      clauses: [],
      rollout: {
        kind: "percentage",
        buckets: [
          { variationIndex: 0, weight: 10 }, // only covers 0.01%
        ],
      },
    };
    const flag = makeFlag({ config: { targetingRules: [rule] } as any });

    // Most users will fall outside the tiny weight range
    // Find a user that falls outside
    let foundError = false;
    for (let i = 0; i < 100; i++) {
      const result = evaluate(flag, { key: `user-${i}` }, emptySegments);
      if (result.reason.kind === "ERROR") {
        foundError = true;
        expect(result.reason).toEqual({ kind: "ERROR", errorKind: "MALFORMED_FLAG" });
        break;
      }
    }
    expect(foundError).toBe(true);
  });
});
