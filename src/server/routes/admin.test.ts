import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import adminRouter from "./admin.js";
import { initDb, closeDb } from "../db.js";

// ============================================================
// Test helpers
// ============================================================

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", adminRouter);
  return app;
}

const API_KEY = "pilot-admin-key-2024";

/** Minimal fetch-like helper using the app directly via supertest-style inject */
async function req(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  // Use node's built-in test server
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
          "X-API-Key": API_KEY,
          ...headers,
        },
      };
      if (body) opts.body = JSON.stringify(body);

      fetch(url, opts)
        .then(async (res) => {
          const text = await res.text();
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            json = text || null;
          }
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

// ============================================================
// Tests
// ============================================================

describe("Admin API", () => {
  let app: express.Express;

  beforeEach(() => {
    initDb(":memory:");
    app = createApp();
  });

  afterEach(() => {
    closeDb();
  });

  // ------ Auth ------

  it("rejects requests without API key", async () => {
    const res = await req(app, "GET", "/api/projects", undefined, { "X-API-Key": "" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects requests with wrong API key", async () => {
    const res = await req(app, "GET", "/api/projects", undefined, { "X-API-Key": "wrong-key" });
    expect(res.status).toBe(401);
  });

  // ------ Projects CRUD ------

  it("creates and lists projects", async () => {
    const create = await req(app, "POST", "/api/projects", { name: "Test", key: "test" });
    expect(create.status).toBe(201);
    expect(create.body.key).toBe("test");

    const list = await req(app, "GET", "/api/projects");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("gets a project by id", async () => {
    const create = await req(app, "POST", "/api/projects", { name: "P1", key: "p1" });
    const get = await req(app, "GET", `/api/projects/${create.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe("P1");
  });

  it("returns 404 for non-existent project", async () => {
    const res = await req(app, "GET", "/api/projects/nonexistent");
    expect(res.status).toBe(404);
  });

  it("rejects duplicate project key", async () => {
    await req(app, "POST", "/api/projects", { name: "P1", key: "dup" });
    const dup = await req(app, "POST", "/api/projects", { name: "P2", key: "dup" });
    expect(dup.status).toBe(409);
  });

  it("updates a project", async () => {
    const create = await req(app, "POST", "/api/projects", { name: "Old", key: "upd" });
    const upd = await req(app, "PUT", `/api/projects/${create.body.id}`, { name: "New" });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe("New");
  });

  it("deletes a project", async () => {
    const create = await req(app, "POST", "/api/projects", { name: "Del", key: "del" });
    const del = await req(app, "DELETE", `/api/projects/${create.body.id}`);
    expect(del.status).toBe(204);
    const get = await req(app, "GET", `/api/projects/${create.body.id}`);
    expect(get.status).toBe(404);
  });

  it("returns 400 for project creation with missing fields", async () => {
    const res = await req(app, "POST", "/api/projects", { name: "NoKey" });
    expect(res.status).toBe(400);
  });

  // ------ Environments CRUD ------

  it("creates and lists environments", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "p" });
    const create = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, {
      name: "Dev", key: "dev", color: "#22c55e",
    });
    expect(create.status).toBe(201);
    expect(create.body.sdkKey).toBeTruthy();
    expect(create.body.clientSdkKey).toBeTruthy();

    const list = await req(app, "GET", `/api/projects/${proj.body.id}/environments`);
    expect(list.body).toHaveLength(1);
  });

  it("rejects duplicate environment key", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "p2" });
    await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" });
    const dup = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev2", key: "dev" });
    expect(dup.status).toBe(409);
  });

  it("prevents deleting the last environment", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "p3" });
    const env = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Only", key: "only" });
    const del = await req(app, "DELETE", `/api/projects/${proj.body.id}/environments/${env.body.id}`);
    expect(del.status).toBe(400);
  });

  it("deletes an environment when not the last one", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "p4" });
    const env1 = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "E1", key: "e1" });
    await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "E2", key: "e2" });
    const del = await req(app, "DELETE", `/api/projects/${proj.body.id}/environments/${env1.body.id}`);
    expect(del.status).toBe(204);
  });

  // ------ Flags CRUD ------

  it("creates a flag and returns it with environment configs", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "fp" });
    await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" });

    const flag = await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "dark-mode", name: "Dark Mode", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });
    expect(flag.status).toBe(201);
    expect(flag.body.key).toBe("dark-mode");

    // List should return FlagWithConfigs
    const list = await req(app, "GET", `/api/projects/${proj.body.id}/flags`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].environments).toBeDefined();
  });

  it("gets a flag by key with environment configs", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "fp2" });
    const env = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "my-flag", name: "My Flag", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });

    const get = await req(app, "GET", `/api/projects/${proj.body.id}/flags/my-flag`);
    expect(get.status).toBe(200);
    expect(get.body.environments[env.body.id]).toBeDefined();
    expect(get.body.environments[env.body.id].enabled).toBe(false);
  });

  it("rejects duplicate flag key", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "fp3" });
    const flagBody = {
      key: "dup-flag", name: "F", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    };
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, flagBody);
    const dup = await req(app, "POST", `/api/projects/${proj.body.id}/flags`, flagBody);
    expect(dup.status).toBe(409);
  });

  it("updates and deletes a flag", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "fp4" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "upd-flag", name: "Old", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });

    const upd = await req(app, "PUT", `/api/projects/${proj.body.id}/flags/upd-flag`, { name: "New" });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe("New");

    const del = await req(app, "DELETE", `/api/projects/${proj.body.id}/flags/upd-flag`);
    expect(del.status).toBe(204);

    const get = await req(app, "GET", `/api/projects/${proj.body.id}/flags/upd-flag`);
    expect(get.status).toBe(404);
  });

  // ------ Targeting & Toggle ------

  it("updates targeting rules for a flag", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "tp" });
    const env = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "t-flag", name: "T", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });

    const targeting = await req(app, "PUT", `/api/projects/${proj.body.id}/flags/t-flag/targeting`, {
      environmentId: env.body.id,
      enabled: true,
      defaultVariationIndex: 0,
      targetingRules: [],
    });
    expect(targeting.status).toBe(200);
    expect(targeting.body.enabled).toBe(true);
  });

  it("returns 400 for targeting without environmentId", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "tp2" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "t-flag", name: "T", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });
    const res = await req(app, "PUT", `/api/projects/${proj.body.id}/flags/t-flag/targeting`, {});
    expect(res.status).toBe(400);
  });

  it("toggles a flag on/off", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "tg" });
    const env = await req(app, "POST", `/api/projects/${proj.body.id}/environments`, { name: "Dev", key: "dev" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "tog-flag", name: "Tog", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });

    const toggle = await req(app, "PATCH", `/api/projects/${proj.body.id}/flags/tog-flag/toggle`, {
      environmentId: env.body.id, enabled: true,
    });
    expect(toggle.status).toBe(200);
    expect(toggle.body.enabled).toBe(true);

    // Toggle off
    const off = await req(app, "PATCH", `/api/projects/${proj.body.id}/flags/tog-flag/toggle`, {
      environmentId: env.body.id, enabled: false,
    });
    expect(off.body.enabled).toBe(false);
  });

  it("returns 400 for toggle with missing fields", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "tg2" });
    await req(app, "POST", `/api/projects/${proj.body.id}/flags`, {
      key: "tog-flag", name: "Tog", flagType: "boolean",
      variations: [{ value: true, name: "On" }, { value: false, name: "Off" }],
    });
    const res = await req(app, "PATCH", `/api/projects/${proj.body.id}/flags/tog-flag/toggle`, {});
    expect(res.status).toBe(400);
  });

  // ------ Segments CRUD ------

  it("creates and lists segments", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "sp" });
    const seg = await req(app, "POST", `/api/projects/${proj.body.id}/segments`, {
      key: "beta", name: "Beta Users",
      rules: [{ clauses: [{ attribute: "plan", operator: "eq", values: ["enterprise"], negate: false }] }],
    });
    expect(seg.status).toBe(201);

    const list = await req(app, "GET", `/api/projects/${proj.body.id}/segments`);
    expect(list.body).toHaveLength(1);
  });

  it("rejects duplicate segment key", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "sp2" });
    const segBody = {
      key: "dup-seg", name: "S", rules: [{ clauses: [] }],
    };
    await req(app, "POST", `/api/projects/${proj.body.id}/segments`, segBody);
    const dup = await req(app, "POST", `/api/projects/${proj.body.id}/segments`, segBody);
    expect(dup.status).toBe(409);
  });

  it("updates and deletes a segment", async () => {
    const proj = await req(app, "POST", "/api/projects", { name: "P", key: "sp3" });
    const seg = await req(app, "POST", `/api/projects/${proj.body.id}/segments`, {
      key: "upd-seg", name: "Old", rules: [{ clauses: [] }],
    });

    const upd = await req(app, "PUT", `/api/projects/${proj.body.id}/segments/${seg.body.id}`, { name: "New" });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe("New");

    const del = await req(app, "DELETE", `/api/projects/${proj.body.id}/segments/${seg.body.id}`);
    expect(del.status).toBe(204);
  });
});
