import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Which circles' weekly prayer times this phone reminds me about. Off for
 * every circle until I turn it on in that circle; kept on this phone only
 * (removed with the account's other keys). The reminders themselves are
 * local notifications scheduled on the phone (session/useCircleReminders.ts).
 */
const key = (uid: string) => `circleReminders.${uid}`;
let current: { uid: string; ids: ReadonlySet<string> } = { uid: "", ids: new Set() };
const listeners = new Set<() => void>();
const publish = () => { for (const l of listeners) l(); };

export async function loadCircleReminders(uid: string): Promise<void> {
  try {
    const ids = JSON.parse((await AsyncStorage.getItem(key(uid))) ?? "[]") as unknown;
    current = { uid, ids: new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []) };
  } catch {
    current = { uid, ids: new Set() };
  }
  publish();
}

export function setCircleReminder(uid: string, circleId: string, on: boolean): void {
  const ids = new Set(current.uid === uid ? current.ids : []);
  if (on) ids.add(circleId);
  else ids.delete(circleId);
  current = { uid, ids };
  publish();
  AsyncStorage.setItem(key(uid), JSON.stringify([...ids])).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useCircleReminderIds(uid: string): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => (current.uid === uid ? current.ids : EMPTY));
}
const EMPTY: ReadonlySet<string> = new Set();

/** The notification id for a circle's weekly reminder. */
export const circleReminderId = (circleId: string) => `circle-${circleId}`;
