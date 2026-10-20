import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { ON_TIME_WINDOW_MS, RESPOND_WINDOW_MS } from "./posts";

/**
 * The lock-screen countdown (an iOS Live Activity) for the daily prompt.
 * It's started on the phone, never by the server: when the app is open (or
 * opened from the alert) while the prompt is still on time and I haven't
 * posted. No push tokens are created or stored. It ends when I post, when
 * the on-time window is over and the app is open, or when I turn it off.
 *
 * The lock screen shows "Time to pray" with a 2-minute countdown (like the
 * alert) and "Still on time until 2:21 PM" (true even after the countdown).
 * This file holds the decisions (pure, tested); the app wires them up in
 * session/useLiveActivity.ts.
 */

export type Running = { promptId: string; activityId: string };
export type Plan =
  | { kind: "none" }
  | { kind: "keep" }
  | { kind: "start"; promptId: string; countdownTo: number; onTimeUntil: number; stop: Running | null }
  | { kind: "stop"; stop: Running };

export function planLiveActivity(input: {
  enabled: boolean;
  prompt: { id: string; firedAt: Date } | null;
  /** I've posted for this prompt, or a post is waiting in the outbox. */
  posted: boolean;
  running: Running | null;
  now: number;
}): Plan {
  const { enabled, prompt, posted, running, now } = input;
  const end = prompt ? prompt.firedAt.getTime() + ON_TIME_WINDOW_MS : 0;
  const wanted = enabled && !!prompt && !posted && now < end;
  if (wanted && running?.promptId === prompt!.id) return { kind: "keep" };
  if (wanted) {
    return {
      kind: "start",
      promptId: prompt!.id,
      countdownTo: prompt!.firedAt.getTime() + RESPOND_WINDOW_MS,
      onTimeUntil: end,
      stop: running,
    };
  }
  return running ? { kind: "stop", stop: running } : { kind: "none" };
}

/** When to look again while the app is open: the end of the on-time window. */
export function nextCheckIn(prompt: { firedAt: Date } | null, now: number): number | null {
  if (!prompt) return null;
  const end = prompt.firedAt.getTime() + ON_TIME_WINDOW_MS;
  return end > now ? end - now : null;
}

/** Settings → Notifications → Lock screen countdown. On by default; kept on this phone. */
const ENABLED_KEY = "liveActivity.enabled";
let enabled = true;
const listeners = new Set<() => void>();

export async function loadLiveActivityPref(): Promise<void> {
  try {
    enabled = (await AsyncStorage.getItem(ENABLED_KEY)) !== "0";
  } catch {
    // Keep the default.
  }
  for (const l of listeners) l();
}

export function setLiveActivityEnabled(on: boolean): void {
  enabled = on;
  for (const l of listeners) l();
  AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0").catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useLiveActivityEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled);
}

/** The one that's running, remembered so a restarted app doesn't start a second. */
const RUNNING_KEY = "liveActivity.running";

export async function loadRunning(): Promise<Running | null> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(RUNNING_KEY)) ?? "null");
    return v && typeof v.promptId === "string" && typeof v.activityId === "string" ? { promptId: v.promptId, activityId: v.activityId } : null;
  } catch {
    return null;
  }
}

export function saveRunning(r: Running | null): Promise<void> {
  return (r ? AsyncStorage.setItem(RUNNING_KEY, JSON.stringify(r)) : AsyncStorage.removeItem(RUNNING_KEY)).catch(() => {});
}
