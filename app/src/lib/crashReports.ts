import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { pushAvailable } from "./push";

/**
 * Crash reports (Firebase Crashlytics), in builds that include Firebase's
 * native SDK (push builds: iPhone and TestFlight). On unless turned off in
 * Settings (decided November 2026). A report holds what failed, the phone
 * model, iOS version and a random install id; the app never attaches names,
 * prayers, photos or account ids. The choice is kept on this phone.
 */
const OFF_KEY = "crashReports.off";

type Mod = typeof import("@react-native-firebase/crashlytics");

function crashlytics(): { m: Mod; c: ReturnType<Mod["getCrashlytics"]> } | null {
  if (!pushAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@react-native-firebase/crashlytics") as Mod;
    return { m, c: m.getCrashlytics() };
  } catch {
    return null;
  }
}

export const crashReportsAvailable = (): boolean => pushAvailable();

const listeners = new Set<(on: boolean) => void>();
let current = true;

/** At launch: apply the saved choice (on unless turned off). */
export async function loadCrashReportsPref(): Promise<void> {
  current = (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) !== "1";
  const k = crashlytics();
  if (k) await k.m.setCrashlyticsCollectionEnabled(k.c, current).catch(() => {});
  for (const l of listeners) l(current);
}

export async function setCrashReportsEnabled(on: boolean): Promise<void> {
  current = on;
  for (const l of listeners) l(on);
  await (on ? AsyncStorage.removeItem(OFF_KEY) : AsyncStorage.setItem(OFF_KEY, "1")).catch(() => {});
  const k = crashlytics();
  if (k) await k.m.setCrashlyticsCollectionEnabled(k.c, on).catch(() => {});
}

export function useCrashReportsEnabled(): boolean {
  const [on, setOn] = useState(current);
  useEffect(() => {
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  return on;
}
