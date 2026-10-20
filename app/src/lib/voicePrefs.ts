import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { t, type StringKey } from "../i18n";

/**
 * Listen's voice and speed, kept on this device (display preferences: no one
 * else's content). The voices are the phone's own; more can be downloaded in
 * the iPhone's Settings > Accessibility > Spoken Content > Voices.
 */

export type Speed = "slower" | "normal" | "faster";
export const SPEEDS: readonly { id: Speed; label: string; rate: number }[] = [
  { id: "slower", get label() { return t("speed.slower"); }, rate: 0.85 },
  { id: "normal", get label() { return t("speed.normal"); }, rate: 1 },
  { id: "faster", get label() { return t("speed.faster"); }, rate: 1.15 },
];

export type VoicePrefs = {
  /** A voice identifier from the phone, or null for the phone's default English voice. */
  voice: string | null;
  /** That voice's language (e.g. "en-GB"), so it reads with its own accent. */
  language: string | null;
  speed: Speed;
};

/** The sample in Settings: a verse, so Listen still only ever reads Scripture. */
export const SAMPLE_REF = "PSA.46.10";

export type PhoneVoice = { identifier: string; name: string; quality: string; language: string };
export type VoiceChoice = { identifier: string; language: string; label: string };

const REGIONS = ["US", "GB", "AU", "IE", "ZA", "IN", "NZ", "CA", "SG"];

function region(language: string): string {
  if (/gbsct/i.test(language)) return t("region.scottish");
  const code = language.split(/[-_]/)[1]?.toUpperCase() ?? "";
  return REGIONS.includes(code) ? t(`region.${code}` as StringKey) : code;
}

function grade(v: PhoneVoice): 0 | 1 | 2 {
  if (/\.premium\./i.test(v.identifier)) return 2;
  return v.quality === "Enhanced" ? 1 : 0;
}

/**
 * The phone's English and Spanish voices, best first (Premium, then Enhanced), then by
 * name. iOS's novelty voices (Bells, Bubbles, Zarvox…) are left out: they
 * don't suit reading Scripture.
 */
export function englishVoices(voices: readonly PhoneVoice[]): VoiceChoice[] {
  const seen = new Set<string>();
  return voices
    .filter((v) => /^(en|es)([-_]|$)/i.test(v.language) && !/speech\.synthesis\.voice\./i.test(v.identifier))
    .filter((v) => (seen.has(v.identifier) ? false : (seen.add(v.identifier), true)))
    .sort((a, b) => grade(b) - grade(a) || a.name.localeCompare(b.name) || a.language.localeCompare(b.language))
    .map((v) => {
      const g = grade(v);
      const label = [v.name, region(v.language)].filter(Boolean).join(", ");
      return { identifier: v.identifier, language: v.language, label: g === 2 ? `${label} · ${t("voice.premiumName")}` : g === 1 ? `${label} · ${t("voice.enhanced")}` : label };
    });
}

/** How to speak: the chosen voice if the phone still has it, else the default English voice. */
export function speechOptions(prefs: VoicePrefs, available: ReadonlySet<string> | null): { language: string; voice?: string; rate: number } {
  const rate = SPEEDS.find((s) => s.id === prefs.speed)?.rate ?? 1;
  const usable = prefs.voice && (available === null || available.has(prefs.voice));
  return usable ? { language: prefs.language ?? "en-US", voice: prefs.voice!, rate } : { language: "en-US", rate };
}

const KEY = "listen.voice";
const DEFAULTS: VoicePrefs = { voice: null, language: null, speed: "normal" };
let current: VoicePrefs = DEFAULTS;
const listeners = new Set<() => void>();

export function parseVoicePrefs(raw: string | null): VoicePrefs {
  try {
    const v = raw ? JSON.parse(raw) : {};
    return {
      voice: typeof v.voice === "string" ? v.voice : null,
      language: typeof v.language === "string" ? v.language : null,
      speed: SPEEDS.some((s) => s.id === v.speed) ? v.speed : "normal",
    };
  } catch {
    return DEFAULTS;
  }
}

export async function loadVoicePrefs(): Promise<void> {
  try {
    current = parseVoicePrefs(await AsyncStorage.getItem(KEY));
  } catch {
    // Keep the defaults.
  }
  for (const l of listeners) l();
}

export function getVoicePrefs(): VoicePrefs {
  return current;
}

export function setVoicePrefs(change: Partial<VoicePrefs>): void {
  current = { ...current, ...change };
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore(subscribe, () => current);
}
