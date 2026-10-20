import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { useSyncExternalStore } from "react";
import { currentLang, setCurrentLang, SPANISH_REVIEWED, type Lang } from "./index";

/**
 * Settings → Language: follow the phone (default), or English / Español.
 * Kept on this phone.
 */
export type LangPref = "system" | Lang;

const KEY = "language";
let pref: LangPref = "system";
const listeners = new Set<() => void>();

/** The phone's language, if the app has it (Spanish only once reviewed). */
export function phoneLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === "es" && SPANISH_REVIEWED ? "es" : "en";
  } catch {
    return "en";
  }
}

function apply() {
  setCurrentLang(pref === "system" ? phoneLang() : pref);
  for (const l of listeners) l();
}

export async function loadLangPref(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    pref = v === "en" || v === "es" ? v : "system";
  } catch {
    // Follow the phone.
  }
  apply();
}

export function setLangPref(next: LangPref): void {
  pref = next;
  apply();
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useLangPref(): LangPref {
  return useSyncExternalStore(subscribe, () => pref);
}

/** The language in use; components re-render when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, currentLang);
}
