// Usage: npx tsx apps/api/scripts/new-agent-key.ts <storeId>
// Prints a new agent key (give it to the store agent) and the AGENT_KEYS entry (give it to the API).
import { hashKey, newAgentKey } from "../src/auth";

const storeId = process.argv[2];
if (!storeId) {
  console.error("Usage: new-agent-key <storeId>");
  process.exit(1);
}
const key = newAgentKey();
console.log(`Agent key (store agent config, keep secret): ${key}`);
console.log(`API AGENT_KEYS entry: ${storeId}:${hashKey(key)}`);
