// ============================================================
// Core Entity Types
// ============================================================

/** Top-level organizational unit grouping flags, environments, and segments. */
export interface Project {
  id: string;
  name: string;
  key: string; // unique slug
  createdAt: string;
  updatedAt: string;
}

/** Isolated namespace (e.g. development, staging, production) with independent flag configs. */
export interface Environment {
  id: string;
  projectId: string;
  name: string;
  key: string; // unique within project
  sdkKey: string; // server-side SDK key
  clientSdkKey: string; // client-side SDK key (restricted scope)
  color: string; // UI display color
  createdAt: string;
}

/** A feature flag with variations and metadata. */
export interface FeatureFlag {
  id: string;
  projectId: string;
  key: string; // unique within project
  name: string;
  description: string;
  flagType: FlagType;
  variations: Variation[];
  tags: string[];
  clientSideAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FlagType = "boolean" | "string" | "number" | "json";

/** A possible value a flag can resolve to. */
export interface Variation {
  id: string;
  value: FlagValue;
  name: string;
  description?: string;
}

/** Per-environment flag configuration (toggle state, targeting, defaults). */
export interface FlagEnvironmentConfig {
  flagId: string;
  environmentId: string;
  enabled: boolean;
  defaultVariationIndex: number;
  offVariationIndex: number;
  targetingRules: TargetingRule[];
  version: number;
}

// ============================================================
// Targeting & Rollout Types
// ============================================================

/** A conditional rule that maps matching contexts to a variation via rollout. */
export interface TargetingRule {
  id: string;
  priority: number; // lower = evaluated first
  description?: string;
  clauses: Clause[]; // AND logic within a rule
  rollout: Rollout;
}

/** A single condition within a targeting rule. */
export interface Clause {
  attribute: string; // e.g. "key", "email", "country"
  operator: ClauseOperator;
  values: unknown[]; // values to match against
  negate: boolean;
}

export type ClauseOperator =
  | "eq"
  | "neq"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "segmentMatch";

/** How a matched rule resolves to a variation. */
export type Rollout =
  | { kind: "single"; variationIndex: number }
  | { kind: "percentage"; buckets: RolloutBucket[] };

/** A bucket in a percentage rollout. Weights are 0–100000 for 0.001% precision. */
export interface RolloutBucket {
  variationIndex: number;
  weight: number;
}

// ============================================================
// Segment Types
// ============================================================

/** A reusable named group of users defined by attribute-based conditions. */
export interface Segment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string;
  rules: SegmentRule[]; // OR logic between rules
  createdAt: string;
  updatedAt: string;
}

/** A single rule within a segment (AND logic between clauses). */
export interface SegmentRule {
  clauses: Clause[];
}

// ============================================================
// Evaluation Types
// ============================================================

/** Context provided by a client application for flag evaluation. */
export interface EvaluationContext {
  key: string; // required user key
  [attribute: string]: unknown;
}

/** Result of evaluating a flag for a given context. */
export interface EvaluationResult {
  value: FlagValue;
  variationIndex: number;
  reason: EvaluationReason;
}

/** Why a particular variation was returned. */
export type EvaluationReason =
  | { kind: "OFF" }
  | { kind: "TARGET_MATCH"; ruleIndex: number }
  | { kind: "ROLLOUT"; ruleIndex: number }
  | { kind: "DEFAULT" }
  | { kind: "ERROR"; errorKind: string };

/** Possible flag value types. */
export type FlagValue = boolean | string | number | object | null;

// ============================================================
// Composite type used by the evaluation engine
// ============================================================

/** Full flag config needed by the evaluation engine (flag + environment config merged). */
export interface FeatureFlagConfig {
  flag: FeatureFlag;
  config: FlagEnvironmentConfig;
}

// ============================================================
// API Request Types
// ============================================================

export interface CreateProjectRequest {
  name: string;
  key: string;
}

export interface UpdateProjectRequest {
  name?: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  key: string;
  color?: string;
}

export interface UpdateEnvironmentRequest {
  name?: string;
  color?: string;
}

export interface CreateFlagRequest {
  key: string;
  name: string;
  description?: string;
  flagType: FlagType;
  variations: Omit<Variation, "id">[];
  tags?: string[];
  clientSideAvailable?: boolean;
}

export interface UpdateFlagRequest {
  name?: string;
  description?: string;
  variations?: Omit<Variation, "id">[];
  tags?: string[];
  clientSideAvailable?: boolean;
}

export interface UpdateTargetingRequest {
  environmentId: string;
  enabled?: boolean;
  defaultVariationIndex?: number;
  offVariationIndex?: number;
  targetingRules?: TargetingRule[];
}

export interface ToggleFlagRequest {
  environmentId: string;
  enabled: boolean;
}

export interface CreateSegmentRequest {
  key: string;
  name: string;
  description?: string;
  rules: SegmentRule[];
}

export interface UpdateSegmentRequest {
  name?: string;
  description?: string;
  rules?: SegmentRule[];
}

export interface EvalRequest {
  context: EvaluationContext;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
}

/** Flag with its per-environment configs attached. */
export interface FlagWithConfigs extends FeatureFlag {
  environments: Record<string, FlagEnvironmentConfig>;
}

export interface EvalResponse {
  flagKey: string;
  value: FlagValue;
  variationIndex: number;
  reason: EvaluationReason;
}

export interface BulkEvalResponse {
  results: EvalResponse[];
}
