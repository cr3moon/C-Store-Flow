import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaptureEnvelope } from "@csf/core";
import { CaptureQueue } from "../src";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "csf-queue-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function envelope(sha: string): CaptureEnvelope {
  return {
    storeId: "s",
    agentId: "a",
    kind: "transSet",
    call: { endpoint: "CGILink", cmd: "vtransset", params: {} },
    capturedAt: new Date().toISOString(),
    contentType: "text/xml",
    sha256: sha.padEnd(64, "0"),
    bytes: 1,
    redactions: [],
    agentVersion: "0.1.0",
  };
}

describe("CaptureQueue", () => {
  it("survives a restart", () => {
    const q = new CaptureQueue(dir);
    q.enqueue(envelope("a"), Buffer.from("x"));
    q.markPeriod("DAILY:2026-11-20.401");
    q.close();

    const reopened = new CaptureQueue(dir);
    expect(reopened.stats().pending).toBe(1);
    expect(reopened.hasPeriod("DAILY:2026-11-20.401")).toBe(true);
    reopened.close();
  });

  it("does not queue the same bytes twice, even after they were sent", () => {
    const q = new CaptureQueue(dir);
    expect(q.enqueue(envelope("a"), Buffer.from("x"))).toBe(true);
    expect(q.enqueue(envelope("a"), Buffer.from("x"))).toBe(false);
    q.markSent("a".padEnd(64, "0"));
    expect(q.enqueue(envelope("a"), Buffer.from("x"))).toBe(false);
    q.close();
  });

  it("backs off failed uploads exponentially", () => {
    const q = new CaptureQueue(dir);
    const sha = "b".padEnd(64, "0");
    q.enqueue(envelope("b"), Buffer.from("x"));
    const now = 1_000_000;
    q.markFailed(sha, "offline", now);
    expect(q.due(10, now)).toHaveLength(0);
    expect(q.due(10, now + 5_000)).toHaveLength(1);
    q.markFailed(sha, "offline", now);
    expect(q.due(10, now + 5_000)).toHaveLength(0);
    expect(q.due(10, now + 10_000)).toHaveLength(1);
    q.close();
  });

  it("rolls back a failed transaction completely", () => {
    const q = new CaptureQueue(dir);
    expect(() =>
      q.transaction(() => {
        q.enqueue(envelope("c"), Buffer.from("x"));
        q.markPeriod("DAILY:x");
        throw new Error("crash mid-period");
      }),
    ).toThrow();
    expect(q.stats().pending).toBe(0);
    expect(q.hasPeriod("DAILY:x")).toBe(false);
    q.close();
  });
});
