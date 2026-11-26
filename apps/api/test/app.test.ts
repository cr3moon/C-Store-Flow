import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CaptureEnvelope, Heartbeat } from "@csf/core";
import { buildApp, hashKey, MemoryStore } from "../src";

const KEY = "csf_agent_test";
const storeId = "van-buren";

async function setup() {
  const store = new MemoryStore();
  const app = await buildApp({ store, agentKeys: new Map([[storeId, hashKey(KEY)]]) });
  return { app, store };
}

function upload(body = Buffer.from("<transSet/>")) {
  const envelope: CaptureEnvelope = {
    storeId,
    agentId: "agent-1",
    kind: "transSet",
    call: { endpoint: "CGILink", cmd: "vtransset", params: { filename: "2026-11-20.401", period: "2" } },
    capturedAt: "2026-11-21T08:00:00-06:00",
    periodKey: "DAILY:2026-11-20.401:transSet",
    contentType: "text/xml",
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
    redactions: [],
    agentVersion: "0.1.0",
  };
  return { envelope, bodyGzipBase64: gzipSync(body).toString("base64") };
}

const auth = { authorization: `Bearer ${KEY}` };

describe("API", () => {
  it("stores a capture once and reports duplicates", async () => {
    const { app, store } = await setup();
    const payload = upload();
    const first = await app.inject({ method: "POST", url: "/v1/agent/captures", headers: auth, payload });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ status: "stored" });
    const again = await app.inject({ method: "POST", url: "/v1/agent/captures", headers: auth, payload });
    expect(again.json()).toMatchObject({ status: "duplicate" });
    expect(await store.listCaptures(storeId)).toHaveLength(1);
  });

  it("rejects a body whose hash does not match", async () => {
    const { app } = await setup();
    const payload = upload();
    payload.envelope.sha256 = "0".repeat(64);
    const res = await app.inject({ method: "POST", url: "/v1/agent/captures", headers: auth, payload });
    expect(res.statusCode).toBe(422);
  });

  it("rejects a wrong or missing agent key", async () => {
    const { app } = await setup();
    const wrong = await app.inject({
      method: "POST",
      url: "/v1/agent/captures",
      headers: { authorization: "Bearer nope" },
      payload: upload(),
    });
    expect(wrong.statusCode).toBe(401);
    const missing = await app.inject({ method: "POST", url: "/v1/agent/captures", payload: upload() });
    expect(missing.statusCode).toBe(401);
  });

  it("reports store status from heartbeats and captures", async () => {
    const { app } = await setup();
    const beat: Heartbeat = {
      storeId,
      agentId: "agent-1",
      agentVersion: "0.1.0",
      sentAt: new Date().toISOString(),
      os: "linux",
      commander: { reachable: true, lastOkAt: new Date().toISOString(), lastError: null },
      queue: { pending: 3, oldestPendingAt: null },
      lastCaptureAt: null,
    };
    expect((await app.inject({ method: "POST", url: "/v1/agent/heartbeat", headers: auth, payload: beat })).statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/v1/agent/captures", headers: auth, payload: upload() });

    const status = (await app.inject({ method: "GET", url: `/v1/stores/${storeId}/status` })).json();
    expect(status).toMatchObject({
      agentOnline: true,
      commanderReachable: true,
      queuePending: 3,
      captureCount: 1,
      lastCaptureKind: "transSet",
    });
  });
});
