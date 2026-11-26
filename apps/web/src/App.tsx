import { useEffect, useState } from "react";
import type { StoreStatus } from "@csf/core";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const STORE_ID = import.meta.env.VITE_STORE_ID ?? "van-buren";

function when(iso: string | null): string {
  if (!iso) return "Never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleString();
}

/**
 * Phase 1 shows only whether the store agent is alive. Home and Daily close,
 * per the approved mockups, arrive in Phase 2 once real data flows.
 */
export function App() {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/stores/${STORE_ID}/status`);
        if (!res.ok) throw new Error(`API answered ${res.status}`);
        const data = (await res.json()) as StoreStatus;
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Cannot reach the API");
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="page">
      <span className="badge">Phase 1 · connection check only</span>
      <h1>Store connection</h1>
      <p className="muted">Store: {STORE_ID}</p>

      {error && (
        <section className="card">
          <p className="bad">{error}</p>
          <p className="muted">Is the API running at {API_URL}?</p>
        </section>
      )}

      {status && (
        <section className="card rows" aria-live="polite">
          <div className="row">
            <span>Store agent</span>
            <span className={status.agentOnline ? "ok" : "bad"}>{status.agentOnline ? "Online" : "Offline"}</span>
          </div>
          <div className="row">
            <span>Last heard from</span>
            <span>{when(status.agentLastSeenAt)}</span>
          </div>
          <div className="row">
            <span>Register (Commander)</span>
            <span className={status.commanderReachable ? "ok" : status.commanderReachable === null ? "" : "warn"}>
              {status.commanderReachable === null ? "Unknown" : status.commanderReachable ? "Reachable" : "Not reachable"}
            </span>
          </div>
          <div className="row">
            <span>Waiting to upload</span>
            <span className={status.queuePending ? "warn" : ""}>{status.queuePending ?? "Unknown"}</span>
          </div>
          <div className="row">
            <span>Reports received</span>
            <span>{status.captureCount}</span>
          </div>
          <div className="row">
            <span>Last report</span>
            <span>{when(status.lastCaptureAt)}</span>
          </div>
        </section>
      )}
    </main>
  );
}
