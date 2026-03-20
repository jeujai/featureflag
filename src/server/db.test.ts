import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initDb,
  closeDb,
  createProject,
  getProject,
  getProjects,
  updateProject,
  deleteProject,
  createEnvironment,
  getEnvironment,
  getEnvironments,
  getEnvironmentBySdkKey,
  updateEnvironment,
  deleteEnvironment,
  createFlag,
  getFlag,
  getFlagByKey,
  getFlags,
  updateFlag,
  deleteFlag,
  getFlagConfig,
  getFlagConfigs,
  updateFlagConfig,
  toggleFlag,
  createSegment,
  getSegment,
  getSegments,
  updateSegment,
  deleteSegment,
} from "./db.js";

describe("SQLite data layer", () => {
  beforeEach(() => {
    initDb(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  // ---- Projects ----
  describe("Projects", () => {
    it("creates and retrieves a project", () => {
      const p = createProject({ name: "Acme", key: "acme" });
      expect(p.name).toBe("Acme");
      expect(p.key).toBe("acme");
      expect(p.id).toBeTruthy();

      const fetched = getProject(p.id);
      expect(fetched).toEqual(p);
    });

    it("lists all projects", () => {
      createProject({ name: "A", key: "a" });
      createProject({ name: "B", key: "b" });
      expect(getProjects()).toHaveLength(2);
    });

    it("rejects duplicate project keys", () => {
      createProject({ name: "A", key: "dup" });
      expect(() => createProject({ name: "B", key: "dup" })).toThrow();
    });

    it("updates a project", () => {
      const p = createProject({ name: "Old", key: "old" });
      const updated = updateProject(p.id, { name: "New" });
      expect(updated?.name).toBe("New");
    });

    it("deletes a project", () => {
      const p = createProject({ name: "Del", key: "del" });
      expect(deleteProject(p.id)).toBe(true);
      expect(getProject(p.id)).toBeUndefined();
    });
  });

  // ---- Environments ----
  describe("Environments", () => {
    it("creates environment with generated SDK keys", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Production", key: "production", color: "#22c55e" });
      expect(env.sdkKey).toMatch(/^sdk-/);
      expect(env.clientSdkKey).toMatch(/^csdk-/);
      expect(env.color).toBe("#22c55e");
      expect(env.projectId).toBe(p.id);
    });

    it("looks up environment by SDK key", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      expect(getEnvironmentBySdkKey(env.sdkKey)?.id).toBe(env.id);
      expect(getEnvironmentBySdkKey(env.clientSdkKey)?.id).toBe(env.id);
    });

    it("lists environments for a project", () => {
      const p = createProject({ name: "P", key: "p" });
      createEnvironment(p.id, { name: "Dev", key: "dev" });
      createEnvironment(p.id, { name: "Prod", key: "prod" });
      expect(getEnvironments(p.id)).toHaveLength(2);
    });

    it("updates an environment", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Old", key: "old" });
      const updated = updateEnvironment(env.id, { name: "New", color: "#ff0000" });
      expect(updated?.name).toBe("New");
      expect(updated?.color).toBe("#ff0000");
    });

    it("deletes an environment and cascades configs", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      expect(getFlagConfig(flag.id, env.id)).toBeDefined();
      deleteEnvironment(env.id);
      expect(getEnvironment(env.id)).toBeUndefined();
      expect(getFlagConfig(flag.id, env.id)).toBeUndefined();
    });

    it("auto-creates flag configs for existing flags when environment is added", () => {
      const p = createProject({ name: "P", key: "p" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      // No environments yet, so no configs
      expect(getFlagConfigs(flag.id)).toHaveLength(0);

      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const config = getFlagConfig(flag.id, env.id);
      expect(config).toBeDefined();
      expect(config!.enabled).toBe(false);
    });
  });

  // ---- Feature Flags ----
  describe("Feature Flags", () => {
    it("creates a flag and auto-initializes in all environments", () => {
      const p = createProject({ name: "P", key: "p" });
      const env1 = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const env2 = createEnvironment(p.id, { name: "Prod", key: "prod" });

      const flag = createFlag(p.id, {
        key: "dark-mode", name: "Dark Mode", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
        tags: ["ui"],
        clientSideAvailable: true,
      });

      expect(flag.key).toBe("dark-mode");
      expect(flag.variations).toHaveLength(2);
      expect(flag.variations[0].id).toBeTruthy();
      expect(flag.tags).toEqual(["ui"]);
      expect(flag.clientSideAvailable).toBe(true);

      // Should have configs for both environments
      const configs = getFlagConfigs(flag.id);
      expect(configs).toHaveLength(2);
      for (const c of configs) {
        expect(c.enabled).toBe(false);
        expect(c.defaultVariationIndex).toBe(0);
        expect(c.offVariationIndex).toBe(0);
        expect(c.version).toBe(1);
      }
    });

    it("retrieves flag by project + key", () => {
      const p = createProject({ name: "P", key: "p" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "string",
        variations: [{ value: "a", name: "A" }, { value: "b", name: "B" }],
      });
      const found = getFlagByKey(p.id, "f1");
      expect(found?.id).toBe(flag.id);
    });

    it("rejects duplicate flag keys within a project", () => {
      const p = createProject({ name: "P", key: "p" });
      createFlag(p.id, {
        key: "dup", name: "Dup", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      expect(() =>
        createFlag(p.id, {
          key: "dup", name: "Dup2", flagType: "boolean",
          variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
        })
      ).toThrow();
    });

    it("updates a flag", () => {
      const p = createProject({ name: "P", key: "p" });
      const flag = createFlag(p.id, {
        key: "f1", name: "Old", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      const updated = updateFlag(flag.id, { name: "New", tags: ["updated"] });
      expect(updated?.name).toBe("New");
      expect(updated?.tags).toEqual(["updated"]);
    });

    it("deletes a flag and cascades env configs", () => {
      const p = createProject({ name: "P", key: "p" });
      createEnvironment(p.id, { name: "Dev", key: "dev" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      expect(getFlagConfigs(flag.id)).toHaveLength(1);
      deleteFlag(flag.id);
      expect(getFlag(flag.id)).toBeUndefined();
      expect(getFlagConfigs(flag.id)).toHaveLength(0);
    });
  });

  // ---- Flag Environment Configs ----
  describe("Flag Environment Configs", () => {
    it("updates flag config and increments version", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });

      const updated = updateFlagConfig(flag.id, env.id, {
        enabled: true,
        defaultVariationIndex: 1,
        targetingRules: [{ id: "r1", priority: 0, clauses: [], rollout: { kind: "single", variationIndex: 0 } }],
      });

      expect(updated?.enabled).toBe(true);
      expect(updated?.defaultVariationIndex).toBe(1);
      expect(updated?.targetingRules).toHaveLength(1);
      expect(updated?.version).toBe(2);
    });

    it("toggles a flag on/off", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });

      expect(getFlagConfig(flag.id, env.id)?.enabled).toBe(false);
      toggleFlag(flag.id, env.id, true);
      expect(getFlagConfig(flag.id, env.id)?.enabled).toBe(true);
      toggleFlag(flag.id, env.id, false);
      expect(getFlagConfig(flag.id, env.id)?.enabled).toBe(false);
    });
  });

  // ---- Segments ----
  describe("Segments", () => {
    it("creates and retrieves a segment", () => {
      const p = createProject({ name: "P", key: "p" });
      const seg = createSegment(p.id, {
        key: "beta-users", name: "Beta Users",
        description: "Beta testers",
        rules: [{ clauses: [{ attribute: "plan", operator: "eq", values: ["enterprise"], negate: false }] }],
      });

      expect(seg.key).toBe("beta-users");
      expect(seg.rules).toHaveLength(1);

      const fetched = getSegment(seg.id);
      expect(fetched).toEqual(seg);
    });

    it("lists segments for a project", () => {
      const p = createProject({ name: "P", key: "p" });
      createSegment(p.id, { key: "s1", name: "S1", rules: [] });
      createSegment(p.id, { key: "s2", name: "S2", rules: [] });
      expect(getSegments(p.id)).toHaveLength(2);
    });

    it("updates a segment", () => {
      const p = createProject({ name: "P", key: "p" });
      const seg = createSegment(p.id, { key: "s1", name: "Old", rules: [] });
      const updated = updateSegment(seg.id, { name: "New", description: "Updated" });
      expect(updated?.name).toBe("New");
      expect(updated?.description).toBe("Updated");
    });

    it("deletes a segment", () => {
      const p = createProject({ name: "P", key: "p" });
      const seg = createSegment(p.id, { key: "s1", name: "S1", rules: [] });
      expect(deleteSegment(seg.id)).toBe(true);
      expect(getSegment(seg.id)).toBeUndefined();
    });

    it("rejects duplicate segment keys within a project", () => {
      const p = createProject({ name: "P", key: "p" });
      createSegment(p.id, { key: "dup", name: "Dup", rules: [] });
      expect(() => createSegment(p.id, { key: "dup", name: "Dup2", rules: [] })).toThrow();
    });
  });

  // ---- Cascade on project delete ----
  describe("Project deletion cascade", () => {
    it("deletes all related entities when project is deleted", () => {
      const p = createProject({ name: "P", key: "p" });
      const env = createEnvironment(p.id, { name: "Dev", key: "dev" });
      const flag = createFlag(p.id, {
        key: "f1", name: "F1", flagType: "boolean",
        variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
      });
      createSegment(p.id, { key: "s1", name: "S1", rules: [] });

      deleteProject(p.id);

      expect(getEnvironments(p.id)).toHaveLength(0);
      expect(getFlags(p.id)).toHaveLength(0);
      expect(getSegments(p.id)).toHaveLength(0);
      expect(getFlagConfigs(flag.id)).toHaveLength(0);
    });
  });
});
