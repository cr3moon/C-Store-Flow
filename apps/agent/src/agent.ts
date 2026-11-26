import os from "node:os";
import { CommanderClient, type Transport } from "@csf/commander";
import type { Heartbeat } from "@csf/core";
import type { AgentConfig } from "./config";
import { pollOnce, type PollResult } from "./poller";
import { CaptureQueue } from "./queue";
import { sendHeartbeat, uploadPending, type UploadResult } from "./uploader";
import { AGENT_VERSION } from "./version";

export type Log = (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;

export const consoleLog: Log = (level, message, data) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, message, ...data });
  (level === "error" ? console.error : console.log)(line);
};

export interface TickResult {
  poll: PollResult | null;
  pollError: string | null;
  upload: UploadResult;
  heartbeatSent: boolean;
  /** The API refused the agent key, on upload or heartbeat. */
  unauthorized: boolean;
}

/**
 * The agent loop: poll the Commander (with backoff after failures), upload
 * the queue, send a heartbeat. Each step is independent, so a dead Commander
 * never stops uploads and dead internet never stops captures.
 */
export class Agent {
  readonly queue: CaptureQueue;
  private readonly client: CommanderClient;
  private commanderOkAt: string | null = null;
  private commanderError: string | null = null;
  private commanderReachable = false;
  private nextPollAllowedAt = 0;
  private lastCaptureAt: string | null = null;
  private stopped = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly config: AgentConfig,
    private readonly log: Log = consoleLog,
    transport?: Transport,
  ) {
    this.queue = new CaptureQueue(config.dataDir);
    this.client = new CommanderClient(config.commander, transport);
  }

  async tick(now = Date.now()): Promise<TickResult> {
    let poll: PollResult | null = null;
    let pollError: string | null = null;

    if (now >= this.nextPollAllowedAt) {
      try {
        poll = await pollOnce(this.client, this.queue, this.config, now);
        this.commanderReachable = true;
        this.commanderOkAt = new Date(now).toISOString();
        this.commanderError = null;
        if (poll.capturesQueued > 0) this.lastCaptureAt = this.commanderOkAt;
        if (poll.periodsCaptured.length) this.log("info", "captured periods", { periods: poll.periodsCaptured });
      } catch (err) {
        pollError = err instanceof Error ? err.message : String(err);
        this.commanderReachable = false;
        this.commanderError = pollError;
        // Back off so a bad password can never lock the Commander account.
        this.nextPollAllowedAt = now + this.config.commanderBackoffSeconds * 1000;
        this.log("warn", "Commander poll failed; backing off", {
          error: pollError,
          retryAt: new Date(this.nextPollAllowedAt).toISOString(),
        });
      }
    }

    const upload = await uploadPending(this.queue, this.config);

    const stats = this.queue.stats();
    const heartbeat: Heartbeat = {
      storeId: this.config.storeId,
      agentId: this.config.agentId,
      agentVersion: AGENT_VERSION,
      sentAt: new Date().toISOString(),
      os: `${os.platform()} ${os.release()}`,
      commander: { reachable: this.commanderReachable, lastOkAt: this.commanderOkAt, lastError: this.commanderError },
      queue: stats,
      lastCaptureAt: this.lastCaptureAt,
    };
    const beat = await sendHeartbeat(this.config, heartbeat);
    const unauthorized = upload.unauthorized || beat.unauthorized;
    if (unauthorized) this.log("error", "API rejected the agent key. Check CSF_AGENT_KEY.");
    return { poll, pollError, upload, heartbeatSent: beat.sent, unauthorized };
  }

  /** Runs until stop(). One tick per pollSeconds. */
  async run(): Promise<void> {
    this.log("info", "agent started", { version: AGENT_VERSION, storeId: this.config.storeId });
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err) {
        this.log("error", "tick failed", { error: err instanceof Error ? err.message : String(err) });
      }
      this.queue.pruneSent();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.config.pollSeconds * 1000);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    this.queue.close();
    this.log("info", "agent stopped");
  }

  stop(): void {
    this.stopped = true;
    this.wake?.();
  }
}
