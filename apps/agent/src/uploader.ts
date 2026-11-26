import { CaptureAck, type CaptureUpload, type Heartbeat } from "@csf/core";
import type { CaptureQueue } from "./queue";

export interface ApiTarget {
  apiUrl: string;
  agentKey: string;
  timeoutMs?: number;
}

export interface UploadResult {
  sent: number;
  failed: number;
  /** The API refused the agent key. Uploading stops until the key is fixed. */
  unauthorized: boolean;
}

async function post(target: ApiTarget, route: string, body: unknown): Promise<Response> {
  return fetch(new URL(route, target.apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${target.agentKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(target.timeoutMs ?? 60_000),
  });
}

/** Sends due captures oldest first. A capture leaves the queue only on a matching ack. */
export async function uploadPending(queue: CaptureQueue, target: ApiTarget, limit = 20): Promise<UploadResult> {
  const result: UploadResult = { sent: 0, failed: 0, unauthorized: false };
  for (const item of queue.due(limit)) {
    const payload: CaptureUpload = { envelope: item.envelope, bodyGzipBase64: item.bodyGzip.toString("base64") };
    try {
      const res = await post(target, "/v1/agent/captures", payload);
      if (res.status === 401) {
        result.unauthorized = true;
        break;
      }
      if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const ack = CaptureAck.parse(await res.json());
      if (ack.sha256 !== item.envelope.sha256) throw new Error("API acknowledged a different hash");
      queue.markSent(item.envelope.sha256);
      result.sent += 1;
    } catch (err) {
      queue.markFailed(item.envelope.sha256, err instanceof Error ? err.message : String(err));
      result.failed += 1;
      break; // the network is probably down; try again next cycle
    }
  }
  return result;
}

export interface HeartbeatResult {
  sent: boolean;
  /** The API refused the agent key. */
  unauthorized: boolean;
}

/** Also catches a bad agent key when there is nothing waiting to upload. */
export async function sendHeartbeat(target: ApiTarget, heartbeat: Heartbeat): Promise<HeartbeatResult> {
  try {
    const res = await post(target, "/v1/agent/heartbeat", heartbeat);
    return { sent: res.ok, unauthorized: res.status === 401 };
  } catch {
    return { sent: false, unauthorized: false };
  }
}
