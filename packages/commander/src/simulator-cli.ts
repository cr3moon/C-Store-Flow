import { CommanderSimulator } from "./simulator";

const port = Number(process.env.PORT ?? 8180);
const sim = new CommanderSimulator({ port, user: "AGENT", password: "sim" });
await sim.start();
console.log(`Commander simulator on ${sim.url}  (user AGENT, password sim). Synthetic data only.`);
