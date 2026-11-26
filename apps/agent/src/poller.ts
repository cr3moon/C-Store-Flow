import {
  type CommanderClient,
  type CommanderSession,
  isClosedPeriodFilename,
  parsePeriodList,
  type PeriodInfo,
  type RawResponse,
} from "@csf/commander";
import { buildCapture } from "./capture";
import type { AgentConfig } from "./config";
import type { CaptureQueue } from "./queue";

export interface PollResult {
  periodsCaptured: string[];
  capturesQueued: number;
  periodsWaiting: number;
}

/** "DAILY:2026-07-17.312". Marked done once every capture for the period is queued. */
export function periodKey(p: PeriodInfo): string {
  return `${p.kind}:${p.filename}`;
}

function businessDate(filename: string): number {
  return Date.parse(`${filename.slice(0, 10)}T12:00:00Z`);
}

/** Closed periods within the backfill window not yet captured, oldest first. */
export function periodsToCapture(
  periods: PeriodInfo[],
  queue: CaptureQueue,
  config: Pick<AgentConfig, "backfillDays">,
  now = Date.now(),
): PeriodInfo[] {
  const cutoff = now - config.backfillDays * 86_400_000;
  return periods
    .filter((p) => !p.isCurrent && isClosedPeriodFilename(p.filename))
    .filter((p) => businessDate(p.filename) >= cutoff)
    .filter((p) => !queue.hasPeriod(periodKey(p)))
    .sort((a, b) => a.filename.localeCompare(b.filename) || a.kind.localeCompare(b.kind));
}

async function capturePeriod(session: CommanderSession, p: PeriodInfo, config: AgentConfig): Promise<RawResponse[]> {
  const responses = [await session.transSet(p.filename, p.period)];
  if (p.kind === "DAILY") {
    for (const report of config.rubyReports) {
      responses.push(await session.rubyReport(report, p.filename, p.period));
    }
  }
  return responses;
}

/**
 * One poll: inside a single Commander session, capture up to
 * maxPeriodsPerCycle closed periods (all of a period's reports or none),
 * then the live summary for today.
 */
export async function pollOnce(
  client: CommanderClient,
  queue: CaptureQueue,
  config: AgentConfig,
  now = Date.now(),
): Promise<PollResult> {
  const ids = { storeId: config.storeId, agentId: config.agentId };
  return client.session(async (session) => {
    const listResponse = await session.periodList();
    const pending = periodsToCapture(parsePeriodList(listResponse.body.toString("utf8")), queue, config, now);
    const batch = pending.slice(0, config.maxPeriodsPerCycle);
    const result: PollResult = { periodsCaptured: [], capturesQueued: 0, periodsWaiting: pending.length - batch.length };

    for (const p of batch) {
      const key = periodKey(p);
      const responses = await capturePeriod(session, p, config);
      const built = responses.map((r) =>
        buildCapture(r, ids, `${key}:${r.cmd}${r.params.reptname ? `:${r.params.reptname}` : ""}`),
      );
      queue.transaction(() => {
        for (const c of built) if (queue.enqueue(c.envelope, c.bodyGzip)) result.capturesQueued += 1;
        queue.markPeriod(key);
      });
      result.periodsCaptured.push(key);
    }

    if (config.liveSummary) {
      const daily = parsePeriodList(listResponse.body.toString("utf8")).find((p) => p.kind === "DAILY" && p.isCurrent);
      if (daily) {
        const live = buildCapture(await session.rubyReport("summary", "current", daily.period), ids);
        if (queue.enqueue(live.envelope, live.bodyGzip)) result.capturesQueued += 1;
      }
    }
    return result;
  });
}
