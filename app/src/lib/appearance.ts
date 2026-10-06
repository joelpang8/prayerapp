import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Appearance } from "react-native";

/**
 * Night mode. "system" follows the phone's own light/dark setting. Applied
 * with Appearance.setColorScheme, so the app's colors (useColors), the
 * keyboard, alerts and pickers all switch together.
 * A display preference, not anyone's content, so it's kept on the device.
 */
export type AppearancePref = "system" | "light" | "dark";
export const APPEARANCE_OPTIONS: { id: AppearancePref; label: string }[] = [
  { id: "system", label: "Match phone" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const KEY = "ui.appearance";
let current: AppearancePref = "system";
const listeners = new Set<(p: AppearancePref) => void>();

const isPref = (v: unknown): v is AppearancePref => v === "system" || v === "light" || v === "dark";

function apply(pref: AppearancePref) {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

/** Call once at startup, before the first screen renders, to avoid a flash. */
export async function loadAppearance(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (isPref(saved)) current = saved;
  } catch {
    // Unreadable storage: keep following the phone.
  }
  apply(current);
}

export function setAppearance(pref: AppearancePref): void {
  current = pref;
  apply(pref);
  for (const l of listeners) l(pref);
  AsyncStorage.setItem(KEY, pref).catch(() => {});
}

export function useAppearance(): AppearancePref {
  const [pref, setPref] = useState(current);
  useEffect(() => {
    listeners.add(setPref);
    return () => { listeners.delete(setPref); };
  }, []);
  return pref;
}
