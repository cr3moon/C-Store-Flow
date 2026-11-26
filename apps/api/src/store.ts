import type { CaptureEnvelope, Heartbeat } from "@csf/core";

export interface StoredCapture {
  envelope: CaptureEnvelope;
  bodyGzip: Buffer;
  receivedAt: string;
}

/**
 * Where the API keeps data. The scaffold ships an in-memory version;
 * Postgres (migrations/001_init.sql) replaces it in Phase 2.
 */
export interface DataStore {
  /** Idempotent by sha256 per store. Returns false if it already existed. */
  putCapture(capture: StoredCapture): Promise<boolean>;
  listCaptures(storeId: string): Promise<StoredCapture[]>;
  putHeartbeat(heartbeat: Heartbeat, receivedAt: string): Promise<void>;
  lastHeartbeat(storeId: string): Promise<{ heartbeat: Heartbeat; receivedAt: string } | null>;
}

export class MemoryStore implements DataStore {
  private captures = new Map<string, StoredCapture>();
  private heartbeats = new Map<string, { heartbeat: Heartbeat; receivedAt: string }>();

  async putCapture(capture: StoredCapture): Promise<boolean> {
    const key = `${capture.envelope.storeId}:${capture.envelope.sha256}`;
    if (this.captures.has(key)) return false;
    this.captures.set(key, capture);
    return true;
  }

  async listCaptures(storeId: string): Promise<StoredCapture[]> {
    return [...this.captures.values()]
      .filter((c) => c.envelope.storeId === storeId)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async putHeartbeat(heartbeat: Heartbeat, receivedAt: string): Promise<void> {
    this.heartbeats.set(heartbeat.storeId, { heartbeat, receivedAt });
  }

  async lastHeartbeat(storeId: string) {
    return this.heartbeats.get(storeId) ?? null;
  }
}
