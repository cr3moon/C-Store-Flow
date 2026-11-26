import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeTransport, TlsPinError } from "../src";

// A real HTTPS server with a self-signed certificate, like the Commander's.
function makeCert(): { key: string; cert: string } | null {
  const dir = mkdtempSync(path.join(os.tmpdir(), "csf-tls-"));
  try {
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=commander",
        "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")],
      { stdio: "ignore" },
    );
    return { key: readFileSync(path.join(dir, "key.pem"), "utf8"), cert: readFileSync(path.join(dir, "cert.pem"), "utf8") };
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pem = makeCert();
const requestsSeen: string[] = [];
let server: https.Server;
let url: string;
let fingerprint: string;

describe.skipIf(!pem)("certificate pinning against a self-signed HTTPS server", () => {
  beforeAll(async () => {
    fingerprint = new X509Certificate(pem!.cert).fingerprint256;
    server = https.createServer({ key: pem!.key, cert: pem!.cert }, (req, res) => {
      requestsSeen.push(req.url ?? "");
      res.writeHead(200, { "content-type": "text/xml" });
      res.end("<ok/>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `https://127.0.0.1:${(server.address() as AddressInfo).port}/cgi-bin/CGILink?cmd=validate&passwd=secret`;
  });

  afterAll(async () => {
    // Fails with a hook timeout if the client left connections open.
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("connects when the fingerprint matches", async () => {
    const res = await nodeTransport({ method: "GET", url, timeoutMs: 5000, pinnedFingerprint256: fingerprint });
    expect(res.status).toBe(200);
    expect(res.peerFingerprint256).toBe(fingerprint);
  });

  it("refuses a different certificate and never sends the request", async () => {
    requestsSeen.length = 0;
    const wrong = "AA:".repeat(31) + "AA";
    await expect(
      nodeTransport({ method: "GET", url, timeoutMs: 5000, pinnedFingerprint256: wrong }),
    ).rejects.toBeInstanceOf(TlsPinError);
    // Give the server a moment, in case anything slipped through.
    await new Promise((r) => setTimeout(r, 100));
    expect(requestsSeen).toEqual([]);
  });

  it("reads the fingerprint for test-connection when unpinned is allowed", async () => {
    const res = await nodeTransport({ method: "GET", url, timeoutMs: 5000, allowUnpinnedTls: true });
    expect(res.peerFingerprint256).toBe(fingerprint);
  });
});
