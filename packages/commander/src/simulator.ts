import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SYNTHETIC_FIXTURES = fileURLToPath(new URL("../fixtures/synthetic/", import.meta.url));

export interface SimulatorOptions {
  user?: string;
  password?: string;
  fixturesDir?: string;
  /** Like the real Commander, refuse a login when this many sessions are open. */
  maxSessions?: number;
  port?: number;
}

export interface SimulatorCall {
  cmd: string;
  params: Record<string, string>;
}

/**
 * A fake Commander that serves fixture XML over plain HTTP, so the agent can
 * run end to end without a register. Mirrors only the CGILink behaviour in
 * docs/commander-protocol.md.
 */
export class CommanderSimulator {
  readonly calls: SimulatorCall[] = [];
  readonly sessions = new Set<string>();
  /** Highest number of sessions open at once. Tests assert this stays at 1. */
  peakSessions = 0;
  private server: http.Server | null = null;
  private nextCookie = 1;
  private readonly fixtures: string;
  private readonly files: string[];

  constructor(private readonly options: SimulatorOptions = {}) {
    this.fixtures = options.fixturesDir ?? SYNTHETIC_FIXTURES;
    this.files = readdirSync(this.fixtures).filter((f) => f.endsWith(".xml"));
  }

  get url(): string {
    const address = this.server?.address() as AddressInfo | null;
    if (!address) throw new Error("Simulator not started");
    return `http://127.0.0.1:${address.port}`;
  }

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(this.options.port ?? 0, "127.0.0.1", resolve));
    return this.url;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  private fixture(name: string): string {
    return readFileSync(path.join(this.fixtures, name), "utf8");
  }

  private fault(message: string): string {
    return `<?xml version="1.0"?><e:fault xmlns:e="urn:vfi-sapphire:np.error.2001-07-01"><e:message>${message}</e:message></e:fault>`;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://sim");
    const params = Object.fromEntries(url.searchParams);
    const { cmd = "", cookie, user, passwd, ...rest } = params;
    void user;
    void passwd;
    this.calls.push({ cmd, params: rest });

    const send = (body: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/xml; charset=utf-8" });
      res.end(body);
    };

    if (url.pathname !== "/cgi-bin/CGILink") return send(this.fault("Not found"), 404);

    if (cmd === "validate") {
      if (params.user !== (this.options.user ?? "AGENT") || params.passwd !== (this.options.password ?? "sim")) {
        return send(this.fault("Invalid credential"));
      }
      if (this.sessions.size >= (this.options.maxSessions ?? 4)) {
        return send(this.fault("Too many sessions"));
      }
      const id = `SIM${this.nextCookie++}`;
      this.sessions.add(id);
      this.peakSessions = Math.max(this.peakSessions, this.sessions.size);
      return send(this.fixture("validate.xml").replace("SIMCOOKIE", id));
    }

    if (!cookie || !this.sessions.has(cookie)) return send(this.fault("Invalid cookie"));

    switch (cmd) {
      case "releaseCredential":
        this.sessions.delete(cookie);
        return send("<?xml version=\"1.0\"?><released/>");
      case "vtlogpdlist":
      case "vreportpdlist":
        return send(this.fixture("periodlist.xml"));
      case "vtransset": {
        if (!rest.filename) return send(this.fault("no value called filename found"));
        const prefix = rest.period === "1" ? "transset-shift-" : "transset-daily-";
        const file = this.files.find((f) => f === `${prefix}${rest.filename}.xml`);
        return file ? send(this.fixture(file)) : send(this.fault(`No data for ${rest.filename}`));
      }
      case "vrubyrept": {
        if (!rest.reptname) return send(this.fault("no value called reptname found"));
        const file = this.files.find((f) => f === `ruby-${rest.reptname}.xml`);
        return file ? send(this.fixture(file)) : send(this.fault(`No report ${rest.reptname}`));
      }
      default:
        return send(this.fault(`Unknown command ${cmd}`));
    }
  }
}
