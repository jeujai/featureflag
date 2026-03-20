import { Router, Request, Response, NextFunction } from "express";
import * as db from "../db.js";
import type {
  ApiError,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateEnvironmentRequest,
  UpdateEnvironmentRequest,
  CreateFlagRequest,
  UpdateFlagRequest,
  UpdateTargetingRequest,
  ToggleFlagRequest,
  CreateSegmentRequest,
  UpdateSegmentRequest,
  FlagWithConfigs,
  FlagEnvironmentConfig,
} from "../../shared/types.js";

// ============================================================
// Auth — hardcoded API key for pilot
// ============================================================

const ADMIN_API_KEY = "pilot-admin-key-2024";

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== ADMIN_API_KEY) {
    res.status(401).json(errorBody("UNAUTHORIZED", "Invalid or missing API key", 401));
    return;
  }
  next();
}

// ============================================================
// Helpers
// ============================================================

function errorBody(code: string, message: string, status: number): ApiError {
  return { error: { code, message, status } };
}

// ============================================================
// Router
// ============================================================

const router = Router();
router.use(authMiddleware);

// ------ Projects ------

router.get("/projects", (_req: Request, res: Response) => {
  const projects = db.getProjects();
  res.json(projects);
});

router.post("/projects", (req: Request, res: Response) => {
  const body = req.body as CreateProjectRequest;
  if (!body.name || !body.key) {
    res.status(400).json(errorBody("BAD_REQUEST", "name and key are required", 400));
    return;
  }
  const existing = db.getProjectByKey(body.key);
  if (existing) {
    res.status(409).json(errorBody("DUPLICATE", `Project with key "${body.key}" already exists`, 409));
    return;
  }
  const project = db.createProject(body);
  res.status(201).json(project);
});

router.get("/projects/:id", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  res.json(project);
});

router.put("/projects/:id", (req: Request, res: Response) => {
  const body = req.body as UpdateProjectRequest;
  const project = db.updateProject(req.params.id, body);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  res.json(project);
});

router.delete("/projects/:id", (req: Request, res: Response) => {
  const deleted = db.deleteProject(req.params.id);
  if (!deleted) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  res.status(204).send();
});

// ------ Environments ------

router.get("/projects/:id/environments", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const environments = db.getEnvironments(req.params.id);
  res.json(environments);
});

router.post("/projects/:id/environments", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const body = req.body as CreateEnvironmentRequest;
  if (!body.name || !body.key) {
    res.status(400).json(errorBody("BAD_REQUEST", "name and key are required", 400));
    return;
  }
  // Check for duplicate key within project
  const envs = db.getEnvironments(req.params.id);
  if (envs.some((e) => e.key === body.key)) {
    res.status(409).json(errorBody("DUPLICATE", `Environment with key "${body.key}" already exists in this project`, 409));
    return;
  }
  const env = db.createEnvironment(req.params.id, body);
  res.status(201).json(env);
});

router.get("/projects/:id/environments/:envId", (req: Request, res: Response) => {
  const env = db.getEnvironment(req.params.envId);
  if (!env || env.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Environment not found", 404));
    return;
  }
  res.json(env);
});

router.put("/projects/:id/environments/:envId", (req: Request, res: Response) => {
  const existing = db.getEnvironment(req.params.envId);
  if (!existing || existing.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Environment not found", 404));
    return;
  }
  const body = req.body as UpdateEnvironmentRequest;
  const env = db.updateEnvironment(req.params.envId, body);
  res.json(env);
});

router.delete("/projects/:id/environments/:envId", (req: Request, res: Response) => {
  const existing = db.getEnvironment(req.params.envId);
  if (!existing || existing.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Environment not found", 404));
    return;
  }
  // Prevent deletion of the last environment (Req 4.5)
  const envs = db.getEnvironments(req.params.id);
  if (envs.length <= 1) {
    res.status(400).json(errorBody("BAD_REQUEST", "Cannot delete the last environment in a project", 400));
    return;
  }
  db.deleteEnvironment(req.params.envId);
  res.status(204).send();
});

// ------ Flags ------

router.get("/projects/:id/flags", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const flags = db.getFlags(req.params.id);
  // Return FlagWithConfigs — attach per-environment configs for each flag
  const flagsWithConfigs: FlagWithConfigs[] = flags.map((flag) => {
    const configs = db.getFlagConfigs(flag.id);
    const environments: Record<string, FlagEnvironmentConfig> = {};
    for (const cfg of configs) {
      environments[cfg.environmentId] = cfg;
    }
    return { ...flag, environments };
  });
  res.json(flagsWithConfigs);
});

router.post("/projects/:id/flags", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const body = req.body as CreateFlagRequest;
  if (!body.key || !body.name || !body.flagType || !body.variations) {
    res.status(400).json(errorBody("BAD_REQUEST", "key, name, flagType, and variations are required", 400));
    return;
  }
  // Check for duplicate key within project
  const existing = db.getFlagByKey(req.params.id, body.key);
  if (existing) {
    res.status(409).json(errorBody("DUPLICATE", `Flag with key "${body.key}" already exists in this project`, 409));
    return;
  }
  const flag = db.createFlag(req.params.id, body);
  res.status(201).json(flag);
});

router.get("/projects/:id/flags/:flagKey", (req: Request, res: Response) => {
  const flag = db.getFlagByKey(req.params.id, req.params.flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag not found", 404));
    return;
  }
  // Return with per-environment configs
  const configs = db.getFlagConfigs(flag.id);
  const environments: Record<string, FlagEnvironmentConfig> = {};
  for (const cfg of configs) {
    environments[cfg.environmentId] = cfg;
  }
  const result: FlagWithConfigs = { ...flag, environments };
  res.json(result);
});

router.put("/projects/:id/flags/:flagKey", (req: Request, res: Response) => {
  const flag = db.getFlagByKey(req.params.id, req.params.flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag not found", 404));
    return;
  }
  const body = req.body as UpdateFlagRequest;
  const updated = db.updateFlag(flag.id, body);
  res.json(updated);
});

router.delete("/projects/:id/flags/:flagKey", (req: Request, res: Response) => {
  const flag = db.getFlagByKey(req.params.id, req.params.flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag not found", 404));
    return;
  }
  db.deleteFlag(flag.id);
  res.status(204).send();
});

// ------ Flag Targeting ------

router.put("/projects/:id/flags/:flagKey/targeting", (req: Request, res: Response) => {
  const flag = db.getFlagByKey(req.params.id, req.params.flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag not found", 404));
    return;
  }
  const body = req.body as UpdateTargetingRequest;
  if (!body.environmentId) {
    res.status(400).json(errorBody("BAD_REQUEST", "environmentId is required", 400));
    return;
  }
  // Verify environment exists and belongs to this project
  const env = db.getEnvironment(body.environmentId);
  if (!env || env.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Environment not found in this project", 404));
    return;
  }
  const config = db.updateFlagConfig(flag.id, body.environmentId, {
    enabled: body.enabled,
    defaultVariationIndex: body.defaultVariationIndex,
    offVariationIndex: body.offVariationIndex,
    targetingRules: body.targetingRules,
  });
  if (!config) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag environment config not found", 404));
    return;
  }
  res.json(config);
});

// ------ Flag Toggle ------

router.patch("/projects/:id/flags/:flagKey/toggle", (req: Request, res: Response) => {
  const flag = db.getFlagByKey(req.params.id, req.params.flagKey);
  if (!flag) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag not found", 404));
    return;
  }
  const body = req.body as ToggleFlagRequest;
  if (!body.environmentId || typeof body.enabled !== "boolean") {
    res.status(400).json(errorBody("BAD_REQUEST", "environmentId and enabled (boolean) are required", 400));
    return;
  }
  // Verify environment exists and belongs to this project
  const env = db.getEnvironment(body.environmentId);
  if (!env || env.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Environment not found in this project", 404));
    return;
  }
  const config = db.toggleFlag(flag.id, body.environmentId, body.enabled);
  if (!config) {
    res.status(404).json(errorBody("NOT_FOUND", "Flag environment config not found", 404));
    return;
  }
  res.json(config);
});

// ------ Segments ------

router.get("/projects/:id/segments", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const segments = db.getSegments(req.params.id);
  res.json(segments);
});

router.post("/projects/:id/segments", (req: Request, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    res.status(404).json(errorBody("NOT_FOUND", "Project not found", 404));
    return;
  }
  const body = req.body as CreateSegmentRequest;
  if (!body.key || !body.name || !body.rules) {
    res.status(400).json(errorBody("BAD_REQUEST", "key, name, and rules are required", 400));
    return;
  }
  // Check for duplicate key within project
  const existing = db.getSegmentByKey(req.params.id, body.key);
  if (existing) {
    res.status(409).json(errorBody("DUPLICATE", `Segment with key "${body.key}" already exists in this project`, 409));
    return;
  }
  const segment = db.createSegment(req.params.id, body);
  res.status(201).json(segment);
});

router.get("/projects/:id/segments/:segmentId", (req: Request, res: Response) => {
  const segment = db.getSegment(req.params.segmentId);
  if (!segment || segment.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Segment not found", 404));
    return;
  }
  res.json(segment);
});

router.put("/projects/:id/segments/:segmentId", (req: Request, res: Response) => {
  const existing = db.getSegment(req.params.segmentId);
  if (!existing || existing.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Segment not found", 404));
    return;
  }
  const body = req.body as UpdateSegmentRequest;
  const segment = db.updateSegment(req.params.segmentId, body);
  res.json(segment);
});

router.delete("/projects/:id/segments/:segmentId", (req: Request, res: Response) => {
  const existing = db.getSegment(req.params.segmentId);
  if (!existing || existing.projectId !== req.params.id) {
    res.status(404).json(errorBody("NOT_FOUND", "Segment not found", 404));
    return;
  }
  db.deleteSegment(req.params.segmentId);
  res.status(204).send();
});

export default router;
