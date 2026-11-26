import { buildApp } from "./app";
import { parseAgentKeyHashes } from "./auth";
import { MemoryStore } from "./store";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

if (process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is set, but Postgres storage is not wired yet (see docs/gaps.md). Using memory.");
}

const app = await buildApp({
  store: new MemoryStore(),
  agentKeys: parseAgentKeyHashes(process.env.AGENT_KEYS),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(","),
  logger: true,
});

await app.listen({ port, host });
