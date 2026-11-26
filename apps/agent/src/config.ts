import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const AgentConfig = z.object({
  storeId: z.string().min(1),
  agentId: z.string().min(1),
  apiUrl: z.string().url(),
  agentKey: z.string().min(1),
  /** Queue database and logs live here. */
  dataDir: z.string().min(1),
  commander: z.object({
    host: z.string().url(),
    user: z.string().min(1),
    password: z.string().min(1),
    certFingerprint256: z.string().optional(),
    timeoutMs: z.number().int().positive().default(120_000),
  }),
  /** Never faster than once a minute: the Commander is shared with the registers and MyStore. */
  pollSeconds: z.number().int().min(60).default(60),
  /** How far back to capture closed periods on first run. */
  backfillDays: z.number().int().min(1).max(366).default(35),
  /** Closed periods captured per poll, oldest first, so backfill trickles in. */
  maxPeriodsPerCycle: z.number().int().min(1).max(20).default(3),
  rubyReports: z.array(z.enum(["summary", "tax", "department", "network"])).default(["summary", "tax", "department", "network"]),
  /** Capture the current day's Ruby summary every poll, for live sales. */
  liveSummary: z.boolean().default(true),
  /** Wait this long after a Commander login failure, so the account is never locked. */
  commanderBackoffSeconds: z.number().int().min(60).default(300),
  /** Writes to the Commander. Not available until Phase 3; must stay false. */
  writesEnabled: z.literal(false).default(false),
});
export type AgentConfig = z.infer<typeof AgentConfig>;

/**
 * Loads the JSON config, then lets the environment supply secrets so they
 * never have to sit in the file: CSF_AGENT_KEY, CSF_COMMANDER_PASSWORD.
 */
export function loadConfig(file: string, env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const commander = { ...(raw.commander as Record<string, unknown>) };
  if (env.CSF_COMMANDER_PASSWORD) commander.password = env.CSF_COMMANDER_PASSWORD;
  if (typeof commander.certFingerprint256 === "string" && !/[0-9A-F]{2}:/i.test(commander.certFingerprint256)) {
    delete commander.certFingerprint256; // placeholder text from the example file
  }
  const merged = {
    ...raw,
    ...(env.CSF_AGENT_KEY ? { agentKey: env.CSF_AGENT_KEY } : {}),
    commander,
  };
  const config = AgentConfig.parse(merged);
  return { ...config, dataDir: path.resolve(path.dirname(file), config.dataDir) };
}
