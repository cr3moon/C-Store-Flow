import { assertNoFault, CommanderFault, parseValidate, type Credential } from "./parse";
import { nodeTransport, type HttpResponse, type Transport } from "./transport";

export interface CommanderConfig {
  /** e.g. "https://192.168.31.11" */
  host: string;
  user: string;
  password: string;
  certFingerprint256?: string;
  timeoutMs?: number;
}

/** One raw Commander response, before redaction. */
export interface RawResponse {
  endpoint: "CGILink" | "NAXML";
  cmd: string;
  /** Call parameters, never including user, password or cookie. */
  params: Record<string, string>;
  contentType: string;
  body: Buffer;
  receivedAt: Date;
}

export type RubyReportName = "summary" | "tax" | "department" | "network";

/**
 * Read-only Commander calls available inside a session.
 * Write calls (uPLUs) are intentionally absent until Phase 3.
 */
export interface CommanderSession {
  readonly functions: readonly string[];
  periodList(): Promise<RawResponse>;
  reportPeriodList(): Promise<RawResponse>;
  transSet(filename: string, period: string): Promise<RawResponse>;
  rubyReport(reptname: RubyReportName, filename: string, period: string): Promise<RawResponse>;
}

export class CommanderClient {
  private readonly timeoutMs: number;

  constructor(
    private readonly config: CommanderConfig,
    private readonly transport: Transport = nodeTransport,
    private readonly options: { allowUnpinnedTls?: boolean } = {},
  ) {
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  /** Last certificate fingerprint seen. Used by `agent test-connection`. */
  lastPeerFingerprint256: string | undefined;

  /**
   * Logs in, runs `work`, and always releases the session afterwards,
   * so the agent never holds a Commander login open.
   */
  async session<T>(work: (session: CommanderSession) => Promise<T>): Promise<T> {
    const loginBody = await this.cgi("validate", { user: this.config.user, passwd: this.config.password }, false);
    const credential: Credential = parseValidate(loginBody.body.toString("utf8"));
    try {
      return await work(this.makeSession(credential));
    } finally {
      await this.cgi("releaseCredential", { cookie: credential.cookie }, false).catch(() => undefined);
    }
  }

  private makeSession(credential: Credential): CommanderSession {
    const call = (cmd: string, params: Record<string, string>) =>
      this.read(cmd, params, credential.cookie);
    return {
      functions: credential.functions,
      periodList: () => call("vtlogpdlist", {}),
      reportPeriodList: () => call("vreportpdlist", {}),
      transSet: (filename, period) => call("vtransset", { filename, period }),
      rubyReport: (reptname, filename, period) => call("vrubyrept", { reptname, filename, period }),
    };
  }

  private async read(cmd: string, params: Record<string, string>, cookie: string): Promise<RawResponse> {
    const res = await this.cgi(cmd, { ...params, cookie }, true);
    return {
      endpoint: "CGILink",
      cmd,
      params,
      contentType: res.contentType,
      body: res.body,
      receivedAt: new Date(),
    };
  }

  private async cgi(cmd: string, params: Record<string, string>, checkFault: boolean): Promise<HttpResponse> {
    const url = new URL("/cgi-bin/CGILink", this.config.host);
    url.searchParams.set("cmd", cmd);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await this.transport({
      method: "GET",
      url: url.toString(),
      timeoutMs: this.timeoutMs,
      ...(this.config.certFingerprint256 ? { pinnedFingerprint256: this.config.certFingerprint256 } : {}),
      ...(this.options.allowUnpinnedTls ? { allowUnpinnedTls: true } : {}),
    });
    if (res.peerFingerprint256) this.lastPeerFingerprint256 = res.peerFingerprint256;
    if (res.status < 200 || res.status >= 300) {
      throw new CommanderFault(`Commander HTTP ${res.status} on ${cmd}`);
    }
    if (checkFault) {
      // Only the start of a large journal needs checking for a fault envelope.
      const head = res.body.subarray(0, 4096).toString("utf8");
      if (/<(?:[\w-]+:)?fault\b/.test(head)) assertNoFault(res.body.toString("utf8"));
    }
    return res;
  }
}
