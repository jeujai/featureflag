import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import evaluationRouter from "./evaluation.js";
import adminRouter from "./admin.js";
import { initDb, closeDb } from "../db.js";

// ============================================================
// Test helpers
// ============================================================

const ADMIN_API_KEY = "pilot-admin-key-2024";

function createApp() {
  const app = express();
  app.use(express.json());
  // Mount eval router first so it handles /api/eval before admin catches /api
  app.use("/api/eval", evaluationRouter);
  app.use("/api", adminRouter);
  return app;
}

async function req(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  const { default: http } = await import("http");
  const server = http.createServer(app);

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}${path}`;
      const opts: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };
      if (body) opts.body = JSON.stringify(body);

      fetch(url, opts)
        .then(async (res) => {
          const text = await res.text();
          let json: any;
          try { json = JSON.parse(text); } catch { json = text || null; }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

/** Admin helper — create project + environment + flag, return SDK key */
async function seedProjectWithFlag(app: express.Express) {
  const proj = await req(app, "POST", "/api/projects", { name: "Test", key: "test" }, { "X-API-Key": ADMIN_API_KEY });
  const env = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" }, { "X-API-Key": ADMIN_API_KEY });
  await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
    key: "dark-mode", name: "Dark Mode", flagType: "boolean",
    variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
  }, { "X-API-Key": ADMIN_API_KEY });

  return { projectId: proj.body.id, envId: env.body.id, sdkKey: env.body.sdkKey };
}

// ============================================================
// Tests
// ============================================================

describe("Evaluation API", () => {
  let app: express.Express;

  beforeEach(() => {
    initDb(":memory:");
    app = createApp();
  });

  afterEach(() => {
    closeDb();
  });

  // ------ Auth ------

  it("rejects requests without Authorization header", async () => {
    const res = await req(app, "POST", "/api/eval/some-flag", { context: { key: "u1" } });
    expect(res.status).toBe(401);
  });

  it("rejects requests with invalid SDK key", async () => {
    const res = await req(app, "POST", "/api/eval/some-flag", { context: { key: "u1" } }, { Authorization: "Bearer invalid-key" });
    expect(res.status).toBe(401);
  });

  it("rejects requests with malformed Authorization header", async () => {
    const res = await req(app, "POST", "/api/eval/some-flag", { context: { key: "u1" } }, { Authorization: "Basic abc" });
    expect(res.status).toBe(401);
  });

  // ------ Single flag evaluation ------

  it("evaluates a disabled flag and returns off variation", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);

    const res = await req(app, "POST", "/api/eval/dark-mode", { context: { key: "user-1" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(200);
    expect(res.body.flagKey).toBe("dark-mode");
    expect(res.body.value).toBe(true); // offVariationIndex defaults to 0, which is the "On" (true) variation
    expect(res.body.reason.kind).toBe("OFF");
    expect(res.body.variationIndex).toBeDefined();
  });

  it("returns 404 for non-existent flag", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);
    const res = await req(app, "POST", "/api/eval/nonexistent", { context: { key: "user-1" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing context", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);
    const res = await req(app, "POST", "/api/eval/dark-mode", {}, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(400);
  });

  it("returns 400 for context without key", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);
    const res = await req(app, "POST", "/api/eval/dark-mode", { context: { email: "a@b.com" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(400);
  });

  it("evaluates an enabled flag and returns default variation", async () => {
    const { projectId, envId, sdkKey } = await seedProjectWithFlag(app);

    // Enable the flag
    await req(app, "PATCH", `/api/projects/${projectId}/flags/dark-mode/toggle`, { environmentId: envId, enabled: true }, { "X-API-Key": ADMIN_API_KEY });

    const res = await req(app, "POST", "/api/eval/dark-mode", { context: { key: "user-1" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(200);
    expect(res.body.flagKey).toBe("dark-mode");
    expect(res.body.reason.kind).toBe("DEFAULT");
  });

  // ------ Bulk evaluation ------

  it("bulk evaluates all flags for the environment", async () => {
    const { projectId, envId, sdkKey } = await seedProjectWithFlag(app);

    // Create a second flag
    await req(app, "POST", `/api/projects/${projectId}/flags`, {
      key: "new-feature", name: "New Feature", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    }, { "X-API-Key": ADMIN_API_KEY });

    const res = await req(app, "POST", "/api/eval", { context: { key: "user-1" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);

    const keys = res.body.results.map((r: any) => r.flagKey);
    expect(keys).toContain("dark-mode");
    expect(keys).toContain("new-feature");
  });

  it("bulk eval returns 400 for missing context", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);
    const res = await req(app, "POST", "/api/eval", {}, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(400);
  });

  it("bulk eval returns complete response fields", async () => {
    const { sdkKey } = await seedProjectWithFlag(app);
    const res = await req(app, "POST", "/api/eval", { context: { key: "user-1" } }, { Authorization: `Bearer ${sdkKey}` });
    expect(res.status).toBe(200);

    const result = res.body.results[0];
    expect(result).toHaveProperty("flagKey");
    expect(result).toHaveProperty("value");
    expect(result).toHaveProperty("variationIndex");
    expect(result).toHaveProperty("reason");
  });
});
