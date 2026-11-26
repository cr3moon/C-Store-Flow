import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { CaptureEnvelope, CaptureKind } from "@csf/core";
import { redactCardData, type RawResponse } from "@csf/commander";
import { AGENT_VERSION } from "./version";

const KIND_BY_CMD: Record<string, CaptureKind> = {
  vtlogpdlist: "periodList",
  vreportpdlist: "reportPeriodList",
  vtransset: "transSet",
  vrubyrept: "rubyReport",
  vPLUs: "plus",
};

export interface BuiltCapture {
  envelope: CaptureEnvelope;
  bodyGzip: Buffer;
}

/** Redacts card data, hashes, compresses, and describes one Commander response. */
export function buildCapture(
  response: RawResponse,
  ids: { storeId: string; agentId: string },
  periodKey?: string,
): BuiltCapture {
  const kind = KIND_BY_CMD[response.cmd];
  if (!kind) throw new Error(`No capture kind for Commander command ${response.cmd}`);
  const { body, redactions } = redactCardData(response.body);
  const envelope: CaptureEnvelope = {
    storeId: ids.storeId,
    agentId: ids.agentId,
    kind,
    call: { endpoint: response.endpoint, cmd: response.cmd, params: response.params },
    capturedAt: response.receivedAt.toISOString(),
    ...(periodKey ? { periodKey } : {}),
    contentType: response.contentType,
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes: body.length,
    redactions,
    agentVersion: AGENT_VERSION,
  };
  return { envelope, bodyGzip: gzipSync(body) };
}
