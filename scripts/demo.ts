// npm run demo — runs the whole Phase 1 loop on one machine with synthetic data:
// Commander simulator → store agent (one tick) → API, then prints the store status.
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Agent, AgentConfig } from "../apps/agent/src";
import { buildApp, hashKey, MemoryStore } from "../apps/api/src";
import { CommanderSimulator } from "../packages/commander/src";

const key = "csf_agent_demo";
const dataDir = mkdtempSync(path.join(os.tmpdir(), "csf-demo-"));

const sim = new CommanderSimulator({ user: "AGENT", password: "sim" });
await sim.start();

const store = new MemoryStore();
const api = await buildApp({ store, agentKeys: new Map([["van-buren", hashKey(key)]]) });
await api.listen({ port: 0, host: "127.0.0.1" });
const apiUrl = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;

const agent = new Agent(
  AgentConfig.parse({
    storeId: "van-buren",
    agentId: "demo-agent",
    apiUrl,
    agentKey: key,
    dataDir,
    commander: { host: sim.url, user: "AGENT", password: "sim" },
    backfillDays: 366,
  }),
);
const tick = await agent.tick();
agent.queue.close();

const status = (await api.inject({ method: "GET", url: "/v1/stores/van-buren/status" })).json();
console.log("\nTick:", JSON.stringify({ poll: tick.poll, upload: tick.upload }, null, 2));
console.log("\nStore status:", JSON.stringify(status, null, 2));
console.log("\nCaptures in the cloud:");
for (const c of await store.listCaptures("van-buren")) {
  console.log(`  ${c.envelope.kind.padEnd(11)} ${c.envelope.periodKey ?? "(live)"}  ${c.envelope.bytes} bytes  ${c.envelope.redactions.join(", ")}`);
}

await api.close();
await sim.stop();
rmSync(dataDir, { recursive: true, force: true });
