import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A new random agent key. Shown once at store setup; only its hash is kept. */
export function newAgentKey(): string {
  return `csf_agent_${randomBytes(24).toString("base64url")}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Maps storeId to the SHA-256 hash of that store's agent key. */
export type AgentKeyHashes = Map<string, string>;

export function verifyAgentKey(hashes: AgentKeyHashes, storeId: string, presented: string | undefined): boolean {
  const expected = hashes.get(storeId);
  if (!expected || !presented) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hashKey(presented), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parses AGENT_KEYS="store-a:<sha256>,store-b:<sha256>". */
export function parseAgentKeyHashes(value: string | undefined): AgentKeyHashes {
  const map: AgentKeyHashes = new Map();
  for (const pair of (value ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [storeId, hash] = pair.split(":");
    if (!storeId || !hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Bad AGENT_KEYS entry: ${pair}`);
    map.set(storeId, hash);
  }
  return map;
}
