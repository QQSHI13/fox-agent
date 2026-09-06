import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-endpoint-models-"));
  process.env.FOX_AGENT_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("endpoint /models cache", () => {
  test("fetches an openai-style listing, caches it, and re-reads from disk", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        if (req.headers.get("authorization") !== "Bearer k") return new Response("nope", { status: 401 });
        return Response.json({
          data: [
            { id: "b-model", context_window: 200_000 },
            { id: "a-model" },
          ],
        });
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}/v1`;
      const { endpointModels, refreshEndpointModels } = await import("../src/providers/endpointmodels.ts");
      expect(endpointModels(base)).toBeNull();
      expect(await refreshEndpointModels(base, "k")).toBe(true);
      const models = endpointModels(base)!;
      expect(models.map((m) => m.id)).toEqual(["a-model", "b-model"]);
      expect(models[1].context).toBe(200_000);
    } finally {
      server.stop(true);
    }
  });

  test("google listings strip the models/ prefix; failure leaves the cache alone", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ models: [{ name: "models/gemini-x", inputTokenLimit: 1_000_000 }] }),
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const { endpointModels, refreshEndpointModels } = await import("../src/providers/endpointmodels.ts");
      expect(await refreshEndpointModels(base, "k", "google")).toBe(true);
      expect(endpointModels(base)![0].id).toBe("gemini-x");
      expect(endpointModels(base)![0].context).toBe(1_000_000);
      server.stop(true);
      expect(await refreshEndpointModels(base, "k", "google")).toBe(false);
      expect(endpointModels(base)![0].id).toBe("gemini-x"); // old cache survives a failed refresh
    } finally {
      server.stop(true);
    }
  });
});
