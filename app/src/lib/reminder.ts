import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * "Remind me if I haven't prayed" (Settings → Notifications, off by
 * default). A notification on this phone 30 minutes after the day's prompt
 * if I haven't posted. It's scheduled on the phone only once the prompt has
 * fired and the app has seen it (so the day's moment stays secret), and
 * cancelled when I post or turn it off. Nothing goes to the server.
 */
export const REMINDER_AFTER_MS = 30 * 60_000;
export const REMINDER_ID = "prayalong-reminder";

export type ReminderPlan = { kind: "schedule"; at: number; promptId: string } | { kind: "cancel" };

export function planReminder(input: {
  enabled: boolean;
  prompt: { id: string; firedAt: Date } | null;
  /** I've posted for this prompt, or a post is waiting to send. */
  posted: boolean;
  now: number;
}): ReminderPlan {
  const { enabled, prompt, posted, now } = input;
  if (!enabled || !prompt || posted) return { kind: "cancel" };
  const at = prompt.firedAt.getTime() + REMINDER_AFTER_MS;
  // Already past: no reminder now (I'm in the app anyway).
  return at > now ? { kind: "schedule", at, promptId: prompt.id } : { kind: "cancel" };
}

const KEY = "reminder.enabled";
let enabled = false;
const listeners = new Set<() => void>();

export async function loadReminderPref(): Promise<void> {
  try {
    enabled = (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    // Off.
  }
  for (const l of listeners) l();
}

export function setReminderEnabled(on: boolean): void {
  enabled = on;
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, on ? "1" : "0").catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useReminderEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled);
}
