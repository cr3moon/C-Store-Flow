import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import tls from "node:tls";

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /**
   * SHA-256 fingerprint of the Commander's certificate, as Node prints it
   * ("AB:CD:..."). The Commander uses a self-signed certificate, so instead
   * of trusting any certificate we pin this one.
   */
  pinnedFingerprint256?: string;
  /** Only for `agent test-connection`, to read the fingerprint the first time. */
  allowUnpinnedTls?: boolean;
}

export interface HttpResponse {
  status: number;
  contentType: string;
  body: Buffer;
  /** The certificate fingerprint seen, for https. */
  peerFingerprint256?: string;
}

export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export class TlsPinError extends Error {
  constructor(expected: string, actual: string | undefined) {
    super(`Commander certificate changed. Expected ${expected}, got ${actual ?? "none"}. Refusing to connect.`);
    this.name = "TlsPinError";
  }
}

export function normalizeFingerprint(fp: string): string {
  return fp.replace(/[^a-f0-9]/gi, "").toUpperCase();
}

/**
 * Opens the TLS connection and checks the certificate fingerprint BEFORE any
 * HTTP request is written. The login call carries the password in its URL,
 * so nothing may be sent until we know we are talking to our Commander.
 */
function verifiedSocket(url: URL, req: HttpRequest): Promise<{ socket: tls.TLSSocket; fingerprint: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      // Self-signed certificate: CA checks would always fail. The pinned
      // fingerprint is the trust check instead.
      rejectUnauthorized: false,
      ...(isIP(url.hostname) ? {} : { servername: url.hostname }),
    });
    socket.setTimeout(req.timeoutMs, () => socket.destroy(new Error(`Commander timed out after ${req.timeoutMs} ms`)));
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      const fingerprint = socket.getPeerCertificate()?.fingerprint256 ?? "";
      if (
        req.pinnedFingerprint256 &&
        normalizeFingerprint(req.pinnedFingerprint256) !== normalizeFingerprint(fingerprint)
      ) {
        socket.destroy();
        reject(new TlsPinError(req.pinnedFingerprint256, fingerprint || undefined));
        return;
      }
      socket.removeListener("error", reject);
      socket.setTimeout(0); // the HTTP request's own timeout takes over
      resolve({ socket, fingerprint });
    });
  });
}

export const nodeTransport: Transport = async (req) => {
  const url = new URL(req.url);
  const isHttps = url.protocol === "https:";
  if (isHttps && !req.pinnedFingerprint256 && !req.allowUnpinnedTls) {
    throw new Error(
      "No certificate fingerprint configured for the Commander. Run `agent test-connection` to read it, then set commander.certFingerprint256.",
    );
  }

  const tlsConn = isHttps ? await verifiedSocket(url, req) : null;

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      method: req.method,
      headers: { connection: "close", ...req.headers },
      timeout: req.timeoutMs,
      // The socket was already verified by fingerprint above; stop https from
      // repeating the CA check, which a self-signed certificate always fails.
      ...(tlsConn ? { agent: false, rejectUnauthorized: false, createConnection: () => tlsConn.socket } : {}),
    };
    const request = (isHttps ? https : http).request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        // One connection per call: close it so nothing lingers between polls.
        tlsConn?.socket.end();
        resolve({
          status: res.statusCode ?? 0,
          contentType: String(res.headers["content-type"] ?? "application/xml"),
          body: Buffer.concat(chunks),
          ...(tlsConn ? { peerFingerprint256: tlsConn.fingerprint } : {}),
        });
      });
      res.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error(`Commander timed out after ${req.timeoutMs} ms`)));
    request.on("error", reject);
    if (req.body) request.write(req.body);
    request.end();
  });
};
