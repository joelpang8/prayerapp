import { getApp } from "@react-native-firebase/app";
import {
  AuthorizationStatus, getInitialNotification, getMessaging, hasPermission, onMessage, onNotificationOpenedApp,
  requestPermission, subscribeToTopic, unsubscribeFromTopic,
} from "@react-native-firebase/messaging";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { mmss, parsePromptData, windowState, type PromptPush } from "./src/promptWindow";

// STEP 4 PROTOTYPE. Standalone on purpose: no auth, no Firestore, nothing
// shared with the real app. It answers: does the push arrive, how late, in
// which app states, and does the countdown behave?
const TOPIC = "proto-prompt"; // must match notify-proto/src/index.ts

type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];
type Receipt = PromptPush & { how: "foreground" | "opened from background" | "opened from killed"; receivedAtMs: number };

const messaging = getMessaging(getApp());

// On Android, React Native Firebase's requestPermission/hasPermission always
// report "authorized" without asking. Since Android 13 (API 33) the app must
// hold POST_NOTIFICATIONS or the system silently hides every notification,
// so ask for (and report) that permission directly.
const needsAndroidPermission = Platform.OS === "android" && Number(Platform.Version) >= 33;

async function checkPermission(): Promise<string> {
  if (needsAndroidPermission) {
    return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) ? "authorized" : "not granted";
  }
  if (Platform.OS === "android") return "authorized (Android 12 or older: no runtime permission)";
  return describe(await hasPermission(messaging));
}

async function askPermission(): Promise<string> {
  if (needsAndroidPermission) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return r === PermissionsAndroid.RESULTS.GRANTED ? "authorized"
      : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "denied (enable in Settings > Apps)"
      : "denied";
  }
  if (Platform.OS === "android") return checkPermission();
  return describe(await requestPermission(messaging, { alert: true, sound: true, badge: false }));
}

export default function App() {
  const [permission, setPermission] = useState<string>("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const record = useCallback((m: RemoteMessage | null, how: Receipt["how"]) => {
    const p = parsePromptData(m?.data as Record<string, unknown> | undefined);
    if (p) setReceipts((r) => [{ ...p, how, receivedAtMs: Date.now() }, ...r.filter((x) => x.promptId !== p.promptId)]);
  }, []);

  useEffect(() => {
    checkPermission().then(setPermission, () => {});
    getInitialNotification(messaging).then((m) => record(m, "opened from killed"), () => {});
    const offOpened = onNotificationOpenedApp(messaging, (m) => record(m, "opened from background"));
    const offMessage = onMessage(messaging, (m) => record(m, "foreground"));
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { offOpened(); offMessage(); clearInterval(tick); };
  }, [record]);

  async function allow() {
    setError(null);
    try {
      setPermission(await askPermission());
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleTopic() {
    setError(null);
    try {
      if (subscribed) await unsubscribeFromTopic(messaging, TOPIC);
      else await subscribeToTopic(messaging, TOPIC);
      setSubscribed(!subscribed);
    } catch (e) {
      setError(String(e));
    }
  }

  const latest = receipts[0];
  const state = latest ? windowState(latest.firedAtMs, now, latest.windowMs, latest.graceMs) : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Push prototype</Text>
        <Row label="Permission" value={permission} />
        <Row label={`Topic "${TOPIC}"`} value={subscribed ? "subscribed" : "not subscribed"} />
        <View style={styles.buttons}>
          <Button title="Allow notifications" onPress={allow} />
          <Button title={subscribed ? "Unsubscribe" : "Subscribe"} onPress={toggleTopic} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        {latest && state && (
          <View style={styles.countdown}>
            <Text style={styles.phase}>
              {state.phase === "respond" ? "Pray now" : state.phase === "grace" ? "Grace period" : "Late: you can still post"}
            </Text>
            {state.phase !== "late" && <Text style={styles.clock}>{mmss(state.msLeft)}</Text>}
            <Text style={styles.small}>Measured from the server&apos;s fire time, not from when the push arrived.</Text>
          </View>
        )}

        <Text style={styles.section}>Received</Text>
        {receipts.length === 0 && <Text style={styles.small}>Nothing yet. Send one with scripts/proto-run.mjs.</Text>}
        {receipts.map((r) => (
          <View key={r.promptId} style={styles.receipt}>
            <Text style={styles.mono}>{r.promptId}</Text>
            <Text style={styles.small}>fired {new Date(r.firedAtMs).toLocaleTimeString()} · {r.how}</Text>
            <Text style={styles.small}>
              {r.how === "foreground"
                ? `delivery latency ${((r.receivedAtMs - r.firedAtMs) / 1000).toFixed(1)} s (device clock)`
                : `opened ${((r.receivedAtMs - r.firedAtMs) / 1000).toFixed(0)} s after firing (includes your reaction time)`}
            </Text>
            {r.verseRef && <Text style={styles.small}>verse {r.verseRef}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function describe(s: number): string {
  return s === AuthorizationStatus.AUTHORIZED ? "authorized"
    : s === AuthorizationStatus.PROVISIONAL ? "provisional (quiet delivery)"
    : s === AuthorizationStatus.DENIED ? "denied (enable in Settings)"
    : s === AuthorizationStatus.EPHEMERAL ? "ephemeral"
    : "not determined";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FAF8F5" },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: "#6B645C" },
  value: { fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: { flex: 1, backgroundColor: "#5B4B8A", borderRadius: 12, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#B3261E" },
  countdown: { backgroundColor: "#fff", borderRadius: 16, padding: 20, alignItems: "center", gap: 6, marginTop: 12, borderWidth: 1, borderColor: "#E6E1DA" },
  phase: { fontSize: 20, fontWeight: "700" },
  clock: { fontSize: 56, fontWeight: "700", fontVariant: ["tabular-nums"] },
  section: { fontSize: 13, fontWeight: "600", color: "#6B645C", textTransform: "uppercase", marginTop: 20 },
  receipt: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E6E1DA", gap: 2 },
  mono: { fontFamily: "Menlo", fontSize: 13 },
  small: { color: "#6B645C", fontSize: 13 },
});
