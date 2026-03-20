import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type {
  Project,
  Environment,
  FeatureFlag,
  FlagEnvironmentConfig,
  Segment,
  CreateProjectRequest,
  UpdateProjectRequest,
  CreateEnvironmentRequest,
  UpdateEnvironmentRequest,
  CreateFlagRequest,
  UpdateFlagRequest,
  CreateSegmentRequest,
  UpdateSegmentRequest,
} from "../shared/types.js";

// ============================================================
// Database initialization
// ============================================================

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(dbPath: string = "data/flags.db"): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createTables(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      sdk_key TEXT NOT NULL UNIQUE,
      client_sdk_key TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      flag_type TEXT NOT NULL CHECK(flag_type IN ('boolean','string','number','json')),
      variations TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      client_side_available INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS flag_environment_configs (
      flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      default_variation_index INTEGER NOT NULL DEFAULT 0,
      off_variation_index INTEGER NOT NULL DEFAULT 0,
      targeting_rules TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (flag_id, environment_id)
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );
  `);
}

// ============================================================
// Helper: generate SDK keys
// ============================================================

function generateSdkKey(): string {
  return `sdk-${uuidv4()}`;
}

function generateClientSdkKey(): string {
  return `csdk-${uuidv4()}`;
}

// ============================================================
// Row → Domain mappers
// ============================================================

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEnvironment(row: any): Environment {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    key: row.key,
    sdkKey: row.sdk_key,
    clientSdkKey: row.client_sdk_key,
    color: row.color,
    createdAt: row.created_at,
  };
}

function rowToFlag(row: any): FeatureFlag {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.key,
    name: row.name,
    description: row.description,
    flagType: row.flag_type,
    variations: JSON.parse(row.variations),
    tags: JSON.parse(row.tags),
    clientSideAvailable: Boolean(row.client_side_available),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFlagConfig(row: any): FlagEnvironmentConfig {
  return {
    flagId: row.flag_id,
    environmentId: row.environment_id,
    enabled: Boolean(row.enabled),
    defaultVariationIndex: row.default_variation_index,
    offVariationIndex: row.off_variation_index,
    targetingRules: JSON.parse(row.targeting_rules),
    version: row.version,
  };
}

function rowToSegment(row: any): Segment {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    rules: JSON.parse(row.rules),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// Project repository
// ============================================================

export function createProject(req: CreateProjectRequest): Project {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO projects (id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, req.name, req.key, now, now);
  return getProject(id)!;
}

export function getProject(id: string): Project | undefined {
  const row = getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
  return row ? rowToProject(row) : undefined;
}

export function getProjectByKey(key: string): Project | undefined {
  const row = getDb().prepare(`SELECT * FROM projects WHERE key = ?`).get(key) as any;
  return row ? rowToProject(row) : undefined;
}

export function getProjects(): Project[] {
  const rows = getDb().prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as any[];
  return rows.map(rowToProject);
}

export function updateProject(id: string, req: UpdateProjectRequest): Project | undefined {
  const existing = getProject(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`)
    .run(req.name ?? existing.name, now, id);
  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ============================================================
// Environment repository
// ============================================================

export function createEnvironment(projectId: string, req: CreateEnvironmentRequest): Environment {
  const id = uuidv4();
  const sdkKey = generateSdkKey();
  const clientSdkKey = generateClientSdkKey();
  const now = new Date().toISOString();
  const color = req.color ?? "#6366f1";

  getDb()
    .prepare(
      `INSERT INTO environments (id, project_id, name, key, sdk_key, client_sdk_key, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, projectId, req.name, req.key, sdkKey, clientSdkKey, color, now);

  // Auto-create flag configs for all existing flags in this project
  const flags = getDb()
    .prepare(`SELECT id FROM feature_flags WHERE project_id = ?`)
    .all(projectId) as any[];

  const insertConfig = getDb().prepare(
    `INSERT INTO flag_environment_configs (flag_id, environment_id, enabled, default_variation_index, off_variation_index, targeting_rules, version)
     VALUES (?, ?, 0, 0, 0, '[]', 1)`
  );

  for (const flag of flags) {
    insertConfig.run(flag.id, id);
  }

  return getEnvironment(id)!;
}

export function getEnvironment(id: string): Environment | undefined {
  const row = getDb().prepare(`SELECT * FROM environments WHERE id = ?`).get(id) as any;
  return row ? rowToEnvironment(row) : undefined;
}

export function getEnvironmentBySdkKey(sdkKey: string): Environment | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM environments WHERE sdk_key = ? OR client_sdk_key = ?`)
    .get(sdkKey, sdkKey) as any;
  return row ? rowToEnvironment(row) : undefined;
}

export function getEnvironments(projectId: string): Environment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM environments WHERE project_id = ? ORDER BY created_at ASC`)
    .all(projectId) as any[];
  return rows.map(rowToEnvironment);
}

export function updateEnvironment(id: string, req: UpdateEnvironmentRequest): Environment | undefined {
  const existing = getEnvironment(id);
  if (!existing) return undefined;
  getDb()
    .prepare(`UPDATE environments SET name = ?, color = ? WHERE id = ?`)
    .run(req.name ?? existing.name, req.color ?? existing.color, id);
  return getEnvironment(id);
}

export function deleteEnvironment(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM environments WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ============================================================
// Feature Flag repository
// ============================================================

export function createFlag(projectId: string, req: CreateFlagRequest): FeatureFlag {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Assign IDs to variations
  const variations = req.variations.map((v) => ({
    ...v,
    id: uuidv4(),
  }));

  getDb()
    .prepare(
      `INSERT INTO feature_flags (id, project_id, key, name, description, flag_type, variations, tags, client_side_available, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      projectId,
      req.key,
      req.name,
      req.description ?? "",
      req.flagType,
      JSON.stringify(variations),
      JSON.stringify(req.tags ?? []),
      req.clientSideAvailable ? 1 : 0,
      now,
      now
    );

  // Auto-initialize flag in all existing environments (enabled=false)
  const envs = getDb()
    .prepare(`SELECT id FROM environments WHERE project_id = ?`)
    .all(projectId) as any[];

  const insertConfig = getDb().prepare(
    `INSERT INTO flag_environment_configs (flag_id, environment_id, enabled, default_variation_index, off_variation_index, targeting_rules, version)
     VALUES (?, ?, 0, 0, 0, '[]', 1)`
  );

  for (const env of envs) {
    insertConfig.run(id, env.id);
  }

  return getFlag(id)!;
}

export function getFlag(id: string): FeatureFlag | undefined {
  const row = getDb().prepare(`SELECT * FROM feature_flags WHERE id = ?`).get(id) as any;
  return row ? rowToFlag(row) : undefined;
}

export function getFlagByKey(projectId: string, key: string): FeatureFlag | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM feature_flags WHERE project_id = ? AND key = ?`)
    .get(projectId, key) as any;
  return row ? rowToFlag(row) : undefined;
}

export function getFlags(projectId: string): FeatureFlag[] {
  const rows = getDb()
    .prepare(`SELECT * FROM feature_flags WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId) as any[];
  return rows.map(rowToFlag);
}

export function updateFlag(id: string, req: UpdateFlagRequest): FeatureFlag | undefined {
  const existing = getFlag(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();

  // If variations are updated, assign IDs to new ones
  let variations = existing.variations;
  if (req.variations) {
    variations = req.variations.map((v) => ({
      ...v,
      id: uuidv4(),
    }));
  }

  getDb()
    .prepare(
      `UPDATE feature_flags SET name = ?, description = ?, variations = ?, tags = ?, client_side_available = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      req.name ?? existing.name,
      req.description ?? existing.description,
      JSON.stringify(variations),
      JSON.stringify(req.tags ?? existing.tags),
      (req.clientSideAvailable ?? existing.clientSideAvailable) ? 1 : 0,
      now,
      id
    );

  return getFlag(id);
}

export function deleteFlag(id: string): boolean {
  // flag_environment_configs cascade via ON DELETE CASCADE
  const result = getDb().prepare(`DELETE FROM feature_flags WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ============================================================
// Flag Environment Config repository
// ============================================================

export function getFlagConfig(
  flagId: string,
  environmentId: string
): FlagEnvironmentConfig | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM flag_environment_configs WHERE flag_id = ? AND environment_id = ?`
    )
    .get(flagId, environmentId) as any;
  return row ? rowToFlagConfig(row) : undefined;
}

export function getFlagConfigs(flagId: string): FlagEnvironmentConfig[] {
  const rows = getDb()
    .prepare(`SELECT * FROM flag_environment_configs WHERE flag_id = ?`)
    .all(flagId) as any[];
  return rows.map(rowToFlagConfig);
}

export function getFlagConfigsByEnvironment(environmentId: string): FlagEnvironmentConfig[] {
  const rows = getDb()
    .prepare(`SELECT * FROM flag_environment_configs WHERE environment_id = ?`)
    .all(environmentId) as any[];
  return rows.map(rowToFlagConfig);
}

export function updateFlagConfig(
  flagId: string,
  environmentId: string,
  updates: {
    enabled?: boolean;
    defaultVariationIndex?: number;
    offVariationIndex?: number;
    targetingRules?: any[];
  }
): FlagEnvironmentConfig | undefined {
  const existing = getFlagConfig(flagId, environmentId);
  if (!existing) return undefined;

  const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  const defaultVariationIndex = updates.defaultVariationIndex ?? existing.defaultVariationIndex;
  const offVariationIndex = updates.offVariationIndex ?? existing.offVariationIndex;
  const targetingRules = updates.targetingRules
    ? JSON.stringify(updates.targetingRules)
    : JSON.stringify(existing.targetingRules);
  const newVersion = existing.version + 1;

  getDb()
    .prepare(
      `UPDATE flag_environment_configs
       SET enabled = ?, default_variation_index = ?, off_variation_index = ?, targeting_rules = ?, version = ?
       WHERE flag_id = ? AND environment_id = ?`
    )
    .run(enabled, defaultVariationIndex, offVariationIndex, targetingRules, newVersion, flagId, environmentId);

  return getFlagConfig(flagId, environmentId);
}

export function toggleFlag(
  flagId: string,
  environmentId: string,
  enabled: boolean
): FlagEnvironmentConfig | undefined {
  return updateFlagConfig(flagId, environmentId, { enabled });
}

// ============================================================
// Segment repository
// ============================================================

export function createSegment(projectId: string, req: CreateSegmentRequest): Segment {
  const id = uuidv4();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO segments (id, project_id, key, name, description, rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, projectId, req.key, req.name, req.description ?? "", JSON.stringify(req.rules), now, now);

  return getSegment(id)!;
}

export function getSegment(id: string): Segment | undefined {
  const row = getDb().prepare(`SELECT * FROM segments WHERE id = ?`).get(id) as any;
  return row ? rowToSegment(row) : undefined;
}

export function getSegmentByKey(projectId: string, key: string): Segment | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM segments WHERE project_id = ? AND key = ?`)
    .get(projectId, key) as any;
  return row ? rowToSegment(row) : undefined;
}

export function getSegments(projectId: string): Segment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM segments WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId) as any[];
  return rows.map(rowToSegment);
}

export function updateSegment(id: string, req: UpdateSegmentRequest): Segment | undefined {
  const existing = getSegment(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `UPDATE segments SET name = ?, description = ?, rules = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      req.name ?? existing.name,
      req.description ?? existing.description,
      req.rules ? JSON.stringify(req.rules) : JSON.stringify(existing.rules),
      now,
      id
    );

  return getSegment(id);
}

export function deleteSegment(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM segments WHERE id = ?`).run(id);
  return result.changes > 0;
}
