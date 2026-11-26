import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CaptureEnvelope } from "@csf/core";

export interface QueuedCapture {
  envelope: CaptureEnvelope;
  bodyGzip: Buffer;
  attempts: number;
  enqueuedAt: string;
}

const SCHEMA = `
  pragma journal_mode = wal;
  pragma synchronous = full;
  create table if not exists capture (
    sha256          text primary key,
    envelope        text not null,
    body_gzip       blob not null,
    enqueued_at     text not null,
    attempts        integer not null default 0,
    next_attempt_ms integer not null default 0,
    last_error      text
  );
  create table if not exists captured_period (
    period_key  text primary key,
    captured_at text not null
  );
  create table if not exists sent (
    sha256   text primary key,
    sent_at  text not null
  );
`;

/**
 * Durable outbound queue on the store PC. A capture is written here before
 * anything else, and leaves only once the API confirms it by hash. Power cuts
 * and dead internet lose nothing.
 */
export class CaptureQueue {
  private readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "queue.sqlite"));
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /** Runs `fn` in one transaction: all of a period's captures land together, or none do. */
  transaction<T>(fn: () => T): T {
    this.db.exec("begin immediate");
    try {
      const result = fn();
      this.db.exec("commit");
      return result;
    } catch (err) {
      this.db.exec("rollback");
      throw err;
    }
  }

  /** Adds a capture unless the same bytes are already queued or were sent. Returns true if added. */
  enqueue(envelope: CaptureEnvelope, bodyGzip: Buffer, now = new Date()): boolean {
    const known = this.db
      .prepare("select 1 from capture where sha256 = ? union all select 1 from sent where sha256 = ?")
      .get(envelope.sha256, envelope.sha256);
    if (known) return false;
    this.db
      .prepare("insert into capture (sha256, envelope, body_gzip, enqueued_at) values (?, ?, ?, ?)")
      .run(envelope.sha256, JSON.stringify(envelope), bodyGzip, now.toISOString());
    return true;
  }

  hasPeriod(periodKey: string): boolean {
    return Boolean(this.db.prepare("select 1 from captured_period where period_key = ?").get(periodKey));
  }

  markPeriod(periodKey: string, now = new Date()): void {
    this.db
      .prepare("insert or ignore into captured_period (period_key, captured_at) values (?, ?)")
      .run(periodKey, now.toISOString());
  }

  /** Oldest first, only those whose backoff has passed. */
  due(limit: number, now = Date.now()): QueuedCapture[] {
    const rows = this.db
      .prepare(
        "select envelope, body_gzip, attempts, enqueued_at from capture where next_attempt_ms <= ? order by enqueued_at, rowid limit ?",
      )
      .all(now, limit) as { envelope: string; body_gzip: Uint8Array; attempts: number; enqueued_at: string }[];
    return rows.map((r) => ({
      envelope: JSON.parse(r.envelope) as CaptureEnvelope,
      bodyGzip: Buffer.from(r.body_gzip),
      attempts: r.attempts,
      enqueuedAt: r.enqueued_at,
    }));
  }

  markSent(sha256: string, now = new Date()): void {
    this.transaction(() => {
      this.db.prepare("delete from capture where sha256 = ?").run(sha256);
      this.db.prepare("insert or replace into sent (sha256, sent_at) values (?, ?)").run(sha256, now.toISOString());
    });
  }

  /** Exponential backoff: 5 s, 10 s, 20 s … capped at 1 hour. */
  markFailed(sha256: string, error: string, now = Date.now()): void {
    const row = this.db.prepare("select attempts from capture where sha256 = ?").get(sha256) as
      | { attempts: number }
      | undefined;
    const attempts = (row?.attempts ?? 0) + 1;
    const delay = Math.min(5_000 * 2 ** (attempts - 1), 3_600_000);
    this.db
      .prepare("update capture set attempts = ?, next_attempt_ms = ?, last_error = ? where sha256 = ?")
      .run(attempts, now + delay, error.slice(0, 500), sha256);
  }

  stats(): { pending: number; oldestPendingAt: string | null } {
    const row = this.db.prepare("select count(*) as n, min(enqueued_at) as oldest from capture").get() as {
      n: number;
      oldest: string | null;
    };
    return { pending: Number(row.n), oldestPendingAt: row.oldest };
  }

  /** Forget sent hashes older than `days`, to keep the file small. */
  pruneSent(days = 30, now = Date.now()): void {
    this.db.prepare("delete from sent where sent_at < ?").run(new Date(now - days * 86_400_000).toISOString());
  }
}
