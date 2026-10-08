import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Whether I see the names of friends praying for my requests, or just how
 * many. Off by default. A display preference kept on this device: it holds
 * no one else's content. (Taps themselves are never stored on the device.)
 */
const KEY = "praying.showNames";
let current = false;
const listeners = new Set<() => void>();

export async function loadPrayingPrefs(): Promise<void> {
  try {
    current = (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    // Keep the default: counts only.
  }
  for (const l of listeners) l();
}

export function setShowPrayingNames(show: boolean): void {
  current = show;
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, show ? "1" : "0").catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useShowPrayingNames(): boolean {
  return useSyncExternalStore(subscribe, () => current);
}
