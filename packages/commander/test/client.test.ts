import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommanderClient, CommanderFault, CommanderSimulator, parsePeriodList } from "../src";

let sim: CommanderSimulator;

beforeEach(async () => {
  sim = new CommanderSimulator({ user: "AGENT", password: "sim", maxSessions: 1 });
  await sim.start();
});

afterEach(async () => {
  await sim.stop();
});

const client = (password = "sim") => new CommanderClient({ host: sim.url, user: "AGENT", password });

describe("CommanderClient against the simulator", () => {
  it("logs in, reads, and always releases the session", async () => {
    const periods = await client().session(async (s) => parsePeriodList((await s.periodList()).body.toString()));
    expect(periods.length).toBeGreaterThan(0);
    expect(sim.sessions.size).toBe(0);
    expect(sim.calls.map((c) => c.cmd)).toEqual(["validate", "vtlogpdlist", "releaseCredential"]);
  });

  it("releases the session even when the work throws", async () => {
    await expect(
      client().session(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(sim.sessions.size).toBe(0);
  });

  it("never sends the password or cookie in recorded call params", async () => {
    await client().session((s) => s.rubyReport("summary", "current", "2"));
    const read = await client().session((s) => s.transSet("2026-11-20.401", "2"));
    expect(read.params).toEqual({ filename: "2026-11-20.401", period: "2" });
    expect(JSON.stringify(read.params)).not.toMatch(/sim|cookie/i);
  });

  it("raises CommanderFault for a bad password", async () => {
    await expect(client("wrong").session(async () => 1)).rejects.toBeInstanceOf(CommanderFault);
  });

  it("raises CommanderFault for a missing period", async () => {
    await expect(client().session((s) => s.transSet("2001-01-01.1", "2"))).rejects.toBeInstanceOf(CommanderFault);
    expect(sim.sessions.size).toBe(0);
  });

  it("refuses an https Commander with no pinned certificate", async () => {
    const https = new CommanderClient({ host: "https://192.0.2.1", user: "AGENT", password: "sim" });
    await expect(https.session(async () => 1)).rejects.toThrow(/fingerprint/);
  });
});
