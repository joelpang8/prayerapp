import * as LiveActivity from "expo-live-activity";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { palettes } from "../components/ui";
import { loadRunning, nextCheckIn, planLiveActivity, saveRunning, useLiveActivityEnabled, type Running } from "../lib/liveActivity";
import { useLatestPrompt, useMyPosts, useOutbox } from "./hooks";

// The lock screen is dark, so the night palette (the same colors as the app).
const night = palettes.dark;
const CONFIG: LiveActivity.LiveActivityConfig = {
  backgroundColor: night.bg,
  titleColor: night.text,
  subtitleColor: night.muted,
  progressViewTint: night.flame,
  progressViewLabelColor: night.text,
  deepLinkUrl: "/",
  timerType: "digital",
  imagePosition: "left",
  imageAlign: "center",
  imageSize: { width: 24, height: 50 },
  contentFit: "contain",
};

function state(countdownTo: number, onTimeUntil: number, title = "Time to pray"): LiveActivity.LiveActivityState {
  const until = new Date(onTimeUntil).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return {
    title,
    subtitle: `Still on time until ${until}`,
    progressBar: { date: countdownTo },
    imageName: "candle",
    dynamicIslandImageName: "candle",
  };
}

function stop(r: Running) {
  try {
    LiveActivity.stopActivity(r.activityId, { title: "Time to pray", subtitle: "" });
  } catch (err) {
    console.warn("live activity stop failed", err);
  }
}

/**
 * Starts and ends the lock-screen countdown (lib/liveActivity.ts), only
 * while the app is in front: on opening, on a post, at the window's end.
 */
export function useLiveActivity(): void {
  const enabled = useLiveActivityEnabled();
  const { prompt } = useLatestPrompt();
  const { posts, loaded } = useMyPosts();
  const { items: queued } = useOutbox();
  const posted = !!prompt && (posts.some((p) => p.promptId === prompt.id) || queued.some((q) => q.prompt.id === prompt.id));
  const running = useRef<Running | null | undefined>(undefined);
  const [tick, setTick] = useState(0);

  // Re-check when the app comes to the front (e.g. opened from the alert).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") setTick((t) => t + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios" || !loaded || AppState.currentState !== "active") return;
    let live = true;
    (async () => {
      if (running.current === undefined) running.current = await loadRunning();
      if (!live) return;
      const plan = planLiveActivity({ enabled, prompt, posted, running: running.current, now: Date.now() });
      if (plan.kind === "stop" || (plan.kind === "start" && plan.stop)) {
        stop(plan.kind === "stop" ? plan.stop : plan.stop!);
        running.current = null;
        await saveRunning(null);
      }
      if (plan.kind === "start") {
        const activityId = LiveActivity.startActivity(state(plan.countdownTo, plan.onTimeUntil), CONFIG);
        if (activityId) {
          running.current = { promptId: plan.promptId, activityId };
          await saveRunning(running.current);
        }
      }
    })().catch((err) => console.warn("live activity failed", err));
    // Look again at the end of the window, to end it while the app is open.
    const wait = nextCheckIn(prompt, Date.now());
    const t = wait === null ? undefined : setTimeout(() => setTick((n) => n + 1), wait + 1000);
    return () => { live = false; if (t) clearTimeout(t); };
  }, [enabled, prompt, posted, loaded, tick]);
}
