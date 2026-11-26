import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

// Kept local so the app builds on its own; matches StoreStatus in @csf/core.
interface StoreStatus {
  agentOnline: boolean;
  agentLastSeenAt: string | null;
  commanderReachable: boolean | null;
  queuePending: number | null;
  captureCount: number;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; storeId?: string };
const API_URL = extra.apiUrl ?? "http://localhost:8080";
const STORE_ID = extra.storeId ?? "van-buren";

const c = {
  bg: "#0E1014",
  surface: "#171A21",
  border: "#262B36",
  text: "#F2F4F8",
  muted: "#9AA3B2",
  accent: "#5EEAD4",
  bad: "#FF7A7A",
};

/** Phase 1 skeleton: store connection status. Screens from the mockups arrive in Phase 2. */
export default function App() {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/v1/stores/${STORE_ID}/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API answered ${r.status}`))))
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.title}>Store connection</Text>
      <View style={styles.card}>
        {error && <Text style={{ color: c.bad }}>{error}</Text>}
        {status && (
          <>
            <Row label="Store agent" value={status.agentOnline ? "Online" : "Offline"} good={status.agentOnline} />
            <Row label="Register" value={status.commanderReachable ? "Reachable" : "Not reachable"} good={!!status.commanderReachable} />
            <Row label="Waiting to upload" value={String(status.queuePending ?? "?")} />
            <Row label="Reports received" value={String(status.captureCount)} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, good === undefined ? null : { color: good ? c.accent : c.bad }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg, padding: 16, gap: 12 },
  title: { color: c.text, fontSize: 28, fontWeight: "700", marginTop: 12 },
  card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 20, padding: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  label: { color: c.text, fontSize: 14 },
  value: { color: c.muted, fontSize: 14, fontWeight: "600" },
});
