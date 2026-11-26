import { z } from "zod";

/** Commander period types. sysid 1 = SHIFT, 2 = DAILY (observed). */
export const PeriodKind = z.enum(["SHIFT", "DAILY"]);
export type PeriodKind = z.infer<typeof PeriodKind>;

export function periodKindFromSysid(sysid: string): PeriodKind | null {
  if (sysid === "1") return "SHIFT";
  if (sysid === "2") return "DAILY";
  return null;
}

/** What kind of Commander response a capture holds. */
export const CaptureKind = z.enum([
  "periodList", // CGILink vtlogpdlist
  "reportPeriodList", // CGILink vreportpdlist
  "transSet", // CGILink vtransset
  "rubyReport", // CGILink vrubyrept
  "plus", // NAXML vPLUs
]);
export type CaptureKind = z.infer<typeof CaptureKind>;

/**
 * Metadata for one raw Commander response. The body travels separately,
 * gzip-compressed, and is hashed after card-data redaction.
 */
export const CaptureEnvelope = z.object({
  storeId: z.string().min(1),
  agentId: z.string().min(1),
  kind: CaptureKind,
  /** The exact call that produced the body, minus credentials and cookie. */
  call: z.object({
    endpoint: z.enum(["CGILink", "NAXML"]),
    cmd: z.string().min(1),
    params: z.record(z.string(), z.string()),
  }),
  /** Store-clock time the response was received, ISO 8601. */
  capturedAt: z.string().datetime({ offset: true }),
  /** Stable key for period captures, e.g. "DAILY:2026-07-17.312:transSet". */
  periodKey: z.string().optional(),
  contentType: z.string(),
  /** SHA-256 hex of the uncompressed, redacted body. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  /** What was removed before hashing, e.g. ["trpCardInfo x 3"]. */
  redactions: z.array(z.string()),
  agentVersion: z.string(),
});
export type CaptureEnvelope = z.infer<typeof CaptureEnvelope>;

/** POST /v1/agent/captures body. */
export const CaptureUpload = z.object({
  envelope: CaptureEnvelope,
  /** gzip(body), base64. */
  bodyGzipBase64: z.string().min(1),
});
export type CaptureUpload = z.infer<typeof CaptureUpload>;

export const CaptureAck = z.object({
  sha256: z.string(),
  status: z.enum(["stored", "duplicate"]),
});
export type CaptureAck = z.infer<typeof CaptureAck>;

/** POST /v1/agent/heartbeat body. */
export const Heartbeat = z.object({
  storeId: z.string().min(1),
  agentId: z.string().min(1),
  agentVersion: z.string(),
  sentAt: z.string().datetime({ offset: true }),
  os: z.string(),
  commander: z.object({
    reachable: z.boolean(),
    lastOkAt: z.string().nullable(),
    lastError: z.string().nullable(),
  }),
  queue: z.object({
    pending: z.number().int().nonnegative(),
    oldestPendingAt: z.string().nullable(),
  }),
  lastCaptureAt: z.string().nullable(),
});
export type Heartbeat = z.infer<typeof Heartbeat>;

/** GET /v1/stores/:storeId/status response. */
export const StoreStatus = z.object({
  storeId: z.string(),
  agentLastSeenAt: z.string().nullable(),
  agentOnline: z.boolean(),
  commanderReachable: z.boolean().nullable(),
  queuePending: z.number().int().nullable(),
  captureCount: z.number().int(),
  lastCaptureAt: z.string().nullable(),
  lastCaptureKind: CaptureKind.nullable(),
});
export type StoreStatus = z.infer<typeof StoreStatus>;

/** An agent is "online" if it sent a heartbeat within this window. */
export const AGENT_ONLINE_WINDOW_MS = 3 * 60_000;
