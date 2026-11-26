#!/usr/bin/env node
import { CommanderClient, parsePeriodList } from "@csf/commander";
import { Agent, consoleLog } from "./agent";
import { loadConfig } from "./config";
import { AGENT_VERSION } from "./version";

const USAGE = `C-Store-Flow store agent ${AGENT_VERSION}

Usage: agent <command> --config <file>

Commands:
  run              Run continuously (what the background service does)
  once             Run one poll + upload + heartbeat, then exit
  test-connection  Log in to the Commander, list periods, print its certificate fingerprint. Read-only.
  status           Show the local queue

Secrets can come from the environment: CSF_AGENT_KEY, CSF_COMMANDER_PASSWORD.`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  const configFile = arg("--config") ?? process.env.CSF_AGENT_CONFIG;
  if (!command || !configFile || command === "help") {
    console.log(USAGE);
    return command === "help" ? 0 : 1;
  }
  const config = loadConfig(configFile);

  switch (command) {
    case "run": {
      const agent = new Agent(config);
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => agent.stop());
      await agent.run();
      return 0;
    }
    case "once": {
      const agent = new Agent(config);
      const result = await agent.tick();
      consoleLog("info", "tick", { ...result });
      agent.queue.close();
      return result.pollError || result.unauthorized ? 2 : 0;
    }
    case "test-connection": {
      const client = new CommanderClient(config.commander, undefined, { allowUnpinnedTls: true });
      const periods = await client.session(async (s) => ({
        functions: s.functions.length,
        periods: parsePeriodList((await s.periodList()).body.toString("utf8")),
      }));
      console.log(`Logged in to ${config.commander.host} as ${config.commander.user}. Session released.`);
      console.log(`Allowed functions: ${periods.functions}`);
      console.log(`Periods listed: ${periods.periods.length} (${periods.periods.filter((p) => !p.isCurrent).length} closed)`);
      if (client.lastPeerFingerprint256) {
        const pinned = config.commander.certFingerprint256;
        console.log(`Certificate fingerprint: ${client.lastPeerFingerprint256}`);
        console.log(
          pinned
            ? pinned.toUpperCase() === client.lastPeerFingerprint256.toUpperCase()
              ? "Matches commander.certFingerprint256."
              : "DOES NOT MATCH commander.certFingerprint256. Check before trusting this device."
            : "Confirm this on the Commander, then set commander.certFingerprint256 to it.",
        );
      }
      return 0;
    }
    case "status": {
      const { CaptureQueue } = await import("./queue");
      const queue = new CaptureQueue(config.dataDir);
      console.log(JSON.stringify(queue.stats(), null, 2));
      queue.close();
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    consoleLog("error", err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
