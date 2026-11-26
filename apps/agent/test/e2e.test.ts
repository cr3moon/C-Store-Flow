import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, hashKey, MemoryStore } from "@csf/api";
import { CommanderSimulator } from "@csf/commander";
import { Agent, AgentConfig } from "../src";

const KEY = "csf_agent_e2e";
const NOW = Date.parse("2026-11-25T09:00:00-06:00");
const quiet = () => undefined;

let dir: string;
let sim: CommanderSimulator;
let store: MemoryStore;
let api: Awaited<ReturnType<typeof buildApp>>;
let apiUrl: string;

async function startApi() {
  api = await buildApp({ store, agentKeys: new Map([["van-buren", hashKey(KEY)]]) });
  await api.listen({ port: 0, host: "127.0.0.1" });
  apiUrl = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;
}

function config(overrides: Partial<{ password: string; apiUrl: string }> = {}): AgentConfig {
  return AgentConfig.parse({
    storeId: "van-buren",
    agentId: "agent-1",
    apiUrl: overrides.apiUrl ?? apiUrl,
    agentKey: KEY,
    dataDir: dir,
    commander: { host: sim.url, user: "AGENT", password: overrides.password ?? "sim" },
  });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "csf-agent-"));
  sim = new CommanderSimulator({ user: "AGENT", password: "sim", maxSessions: 1 });
  await sim.start();
  store = new MemoryStore();
  await startApi();
});

afterEach(async () => {
  await sim.stop();
  await api.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("store agent end to end (simulator → agent → API)", () => {
  it("captures closed periods, strips card data, and uploads everything", async () => {
    const agent = new Agent(config(), quiet);
    const tick = await agent.tick(NOW);

    expect(tick.pollError).toBeNull();
    expect(tick.poll?.periodsCaptured.sort()).toEqual(["DAILY:2026-11-20.401", "SHIFT:2026-11-20.480"]);
    // DAILY: journal + 4 Ruby reports. SHIFT: journal. Live summary has the
    // same bytes as the DAILY summary here, so it is de-duplicated.
    expect(tick.poll?.capturesQueued).toBe(6);
    expect(tick.upload).toMatchObject({ sent: 6, failed: 0 });
    expect(tick.heartbeatSent).toBe(true);

    const captures = await store.listCaptures("van-buren");
    expect(captures).toHaveLength(6);
    const daily = captures.find((c) => c.envelope.periodKey === "DAILY:2026-11-20.401:vtransset")!;
    const body = gunzipSync(daily.bodyGzip).toString("utf8");
    expect(body).not.toMatch(/4242|1111|SIMHOST/);
    expect(daily.envelope.redactions).toEqual(["trpCardInfo x 2"]);

    // One Commander session at a time, and always released.
    expect(sim.peakSessions).toBe(1);
    expect(sim.sessions.size).toBe(0);
    agent.queue.close();
  });

  it("does not capture a period twice", async () => {
    const agent = new Agent(config(), quiet);
    await agent.tick(NOW);
    const second = await agent.tick(NOW + 60_000);
    expect(second.poll?.periodsCaptured).toEqual([]);
    expect(second.poll?.capturesQueued).toBe(0);
    expect(await store.listCaptures("van-buren")).toHaveLength(6);
    agent.queue.close();
  });

  it("keeps captures safe while the internet is down, then catches up", async () => {
    await api.close();
    const offline = new Agent(config({ apiUrl: "http://127.0.0.1:9" }), quiet);
    const first = await offline.tick(NOW);
    expect(first.poll?.capturesQueued).toBe(6);
    expect(first.upload.sent).toBe(0);
    expect(offline.queue.stats().pending).toBe(6);
    offline.queue.close();

    await startApi();
    const online = new Agent(config(), quiet);
    // Past the first retry delay.
    const later = Date.now() + 10_000;
    const realNow = Date.now;
    Date.now = () => later;
    try {
      const second = await online.tick(NOW + 60_000);
      expect(second.upload.sent).toBe(6);
    } finally {
      Date.now = realNow;
    }
    expect(online.queue.stats().pending).toBe(0);
    expect(await store.listCaptures("van-buren")).toHaveLength(6);
    online.queue.close();
  });

  it("notices a refused agent key even when nothing is waiting to upload", async () => {
    const good = new Agent(config(), quiet);
    await good.tick(NOW);
    good.queue.close();

    const bad = new Agent({ ...config(), agentKey: "wrong" }, quiet);
    const tick = await bad.tick(NOW + 60_000);
    expect(tick.upload.sent).toBe(0);
    expect(tick.unauthorized).toBe(true);
    expect(tick.heartbeatSent).toBe(false);
    bad.queue.close();
  });

  it("backs off after a bad Commander password instead of retrying every minute", async () => {
    const agent = new Agent(config({ password: "wrong" }), quiet);
    const first = await agent.tick(NOW);
    expect(first.pollError).toMatch(/Invalid credential/);
    const loginsAfterFirst = sim.calls.filter((c) => c.cmd === "validate").length;

    const second = await agent.tick(NOW + 60_000);
    expect(second.poll).toBeNull();
    expect(sim.calls.filter((c) => c.cmd === "validate").length).toBe(loginsAfterFirst);

    await agent.tick(NOW + 301_000);
    expect(sim.calls.filter((c) => c.cmd === "validate").length).toBe(loginsAfterFirst + 1);
    agent.queue.close();
  });
});
