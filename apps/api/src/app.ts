import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import {
  AGENT_ONLINE_WINDOW_MS,
  CaptureUpload,
  Heartbeat,
  type CaptureAck,
  type StoreStatus,
} from "@csf/core";
import { verifyAgentKey, type AgentKeyHashes } from "./auth";
import type { DataStore } from "./store";

export interface AppOptions {
  store: DataStore;
  agentKeys: AgentKeyHashes;
  /** Largest accepted capture, compressed. Closed daily journals run several MB. */
  maxBodyBytes?: number;
  logger?: boolean;
  now?: () => Date;
  corsOrigins?: string[];
}

function bearer(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? (() => new Date());
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.maxBodyBytes ?? 64 * 1024 * 1024,
  });
  await app.register(cors, { origin: options.corsOrigins ?? false });

  const requireAgent = (req: FastifyRequest, storeId: string) =>
    verifyAgentKey(options.agentKeys, storeId, bearer(req));

  app.get("/health", async () => ({ ok: true }));

  app.post("/v1/agent/heartbeat", async (req, reply) => {
    const parsed = Heartbeat.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    if (!requireAgent(req, parsed.data.storeId)) return reply.code(401).send({ error: "unauthorized" });
    await options.store.putHeartbeat(parsed.data, now().toISOString());
    return { ok: true };
  });

  app.post("/v1/agent/captures", async (req, reply) => {
    const parsed = CaptureUpload.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    const { envelope, bodyGzipBase64 } = parsed.data;
    if (!requireAgent(req, envelope.storeId)) return reply.code(401).send({ error: "unauthorized" });

    const bodyGzip = Buffer.from(bodyGzipBase64, "base64");
    let body: Buffer;
    try {
      body = gunzipSync(bodyGzip);
    } catch {
      return reply.code(400).send({ error: "bad_gzip" });
    }
    // The raw layer is only trustworthy if the bytes match what the agent hashed.
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (sha256 !== envelope.sha256 || body.length !== envelope.bytes) {
      return reply.code(422).send({ error: "hash_mismatch" });
    }

    const stored = await options.store.putCapture({ envelope, bodyGzip, receivedAt: now().toISOString() });
    const ack: CaptureAck = { sha256, status: stored ? "stored" : "duplicate" };
    return reply.code(stored ? 201 : 200).send(ack);
  });

  // People sign-in arrives in Phase 2. Until then this route is open on purpose
  // and shows no sales data, only agent health.
  app.get<{ Params: { storeId: string } }>("/v1/stores/:storeId/status", async (req) => {
    const { storeId } = req.params;
    const [beat, captures] = await Promise.all([
      options.store.lastHeartbeat(storeId),
      options.store.listCaptures(storeId),
    ]);
    const last = captures.at(-1) ?? null;
    const status: StoreStatus = {
      storeId,
      agentLastSeenAt: beat?.receivedAt ?? null,
      agentOnline: beat ? now().getTime() - Date.parse(beat.receivedAt) < AGENT_ONLINE_WINDOW_MS : false,
      commanderReachable: beat?.heartbeat.commander.reachable ?? null,
      queuePending: beat?.heartbeat.queue.pending ?? null,
      captureCount: captures.length,
      lastCaptureAt: last?.receivedAt ?? null,
      lastCaptureKind: last?.envelope.kind ?? null,
    };
    return status;
  });

  return app;
}
