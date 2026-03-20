import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db.js";
import { evaluate } from "../../engine/evaluate.js";
import type {
  ApiError,
  EvalRequest,
  EvalResponse,
  BulkEvalResponse,
  FeatureFlagConfig,
  Segment,
} from "../../shared/types.js";

// ============================================================
// Helpers
// ============================================================

function errorBody(code: string, message: string, status: number): ApiError {
  return { error: { code, message, status } };
}

// ============================================================
// SDK Key Auth Middleware
// ============================================================

/**
 * Authenticate via `Authorization: Bearer <SDK_Key>` header.
 * Looks up the environment by SDK key and attaches it to `res.locals`.
 */
function sdkAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json(errorBody("UNAUTHORIZED", "Missing or invalid Authorization header", 401));
    return;
  }

  const sdkKey = authHeader.slice("Bearer ".length).trim();
  if (!sdkKey) {
    res.status(401).json(errorBody("UNAUTHORIZED", "Missing SDK key", 401));
    return;
  }

  const environment = db.getEnvironmentBySdkKey(sdkKey);
  if (!environment) {
    res.status(401).json(errorBody("UNAUTHORIZED", "Invalid SDK key", 401));
    return;
  }

  res.locals.environment = environment;
  next();
}

// ============================================================
// Router
// ============================================================

const router = Router();
router.use(sdkAuthMiddleware);

/**
 * POST /api/eval/:flagKey — Evaluate a single flag for the given context.
 *
 * Body: { context: EvaluationContext }
 * Returns: { flagKey, value, variationIndex, reason }
 */
router.post("/:flagKey", (req: Request, res: Response) => {
  const { environment } = res.locals;
  const { flagKey } = req.params;
  const body = req.body as EvalRequest;

  if (!body.context || typeof body.context.key !== "string" || body.context.key === "") {
    res.status(400).json(errorBody("BAD_REQUEST", "A valid context with a non-empty 'key' is required", 400));
    return;
  }

  // Look up the flag by key in the environment's project
  const flag = db.getFlagByKey(environment.projectId, flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", `Flag '${flagKey}' not found`, 404));
    return;
  }

  // Get the flag config for this environment
  const config = db.getFlagConfig(flag.id, environment.id);
  if (!config) {
    res.status(404).json(errorBody("NOT_FOUND", `Flag config not found for environment`, 404));
    return;
  }

  // Load all segments for the project
  const segmentsList = db.getSegments(environment.projectId);
  const segments = new Map<string, Segment>();
  for (const seg of segmentsList) {
    segments.set(seg.key, seg);
  }

  const flagConfig: FeatureFlagConfig = { flag, config };
  const result = evaluate(flagConfig, body.context, segments);

  const response: EvalResponse = {
    flagKey,
    value: result.value,
    variationIndex: result.variationIndex,
    reason: result.reason,
  };

  res.json(response);
});

/**
 * POST /api/eval — Bulk evaluate all flags for the environment.
 *
 * Body: { context: EvaluationContext }
 * Returns: { results: [{ flagKey, value, variationIndex, reason }, ...] }
 */
router.post("/", (req: Request, res: Response) => {
  const { environment } = res.locals;
  const body = req.body as EvalRequest;

  if (!body.context || typeof body.context.key !== "string" || body.context.key === "") {
    res.status(400).json(errorBody("BAD_REQUEST", "A valid context with a non-empty 'key' is required", 400));
    return;
  }

  // Get all flags for the project
  const flags = db.getFlags(environment.projectId);

  // Load all segments for the project
  const segmentsList = db.getSegments(environment.projectId);
  const segments = new Map<string, Segment>();
  for (const seg of segmentsList) {
    segments.set(seg.key, seg);
  }

  const results: EvalResponse[] = [];

  for (const flag of flags) {
    const config = db.getFlagConfig(flag.id, environment.id);
    if (!config) continue;

    const flagConfig: FeatureFlagConfig = { flag, config };
    const result = evaluate(flagConfig, body.context, segments);

    results.push({
      flagKey: flag.key,
      value: result.value,
      variationIndex: result.variationIndex,
      reason: result.reason,
    });
  }

  const response: BulkEvalResponse = { results };
  res.json(response);
});

export default router;
