import common from "./strings/common";
import posting from "./strings/posting";
import prayers from "./strings/prayers";
import profileSettings from "./strings/profileSettings";
import scripture from "./strings/scripture";

/**
 * The app's wording in English and Spanish. Pure (no native modules), so
 * lib code and tests can use it. The language is set at startup from the
 * phone's language or the Settings override (prefs.ts); changing it
 * re-renders the whole app (app/_layout.tsx keys the navigator on it).
 *
 * Spanish was translated by Claude and needs a native speaker's review:
 * until SPANISH_REVIEWED is true it's only used when picked in Settings
 * (shown as "Español (en revisión)"), never chosen from the phone's language.
 *
 * Adding wording: put it in the area's file under strings/ (English and
 * Spanish together) and register new files in AREAS below.
 */
export const SPANISH_REVIEWED = false;

export type Lang = "en" | "es";
export const LANGS: readonly Lang[] = ["en", "es"];

const AREAS = [common, posting, prayers, profileSettings, scripture] as const;

type Area = (typeof AREAS)[number];
type AllEn = Area extends infer A ? (A extends { en: infer E } ? E : never) : never;
// Union of every area's keys.
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
export type StringKey = keyof UnionToIntersection<AllEn> & string;

const dictionaries: Record<Lang, Record<string, string>> = { en: {}, es: {} };
for (const area of AREAS) {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(area[lang])) {
      if (k in dictionaries[lang]) throw new Error(`Duplicate string key "${k}"`);
      dictionaries[lang][k] = v;
    }
  }
}

let lang: Lang = "en";

export function currentLang(): Lang {
  return lang;
}

/** Set by prefs.ts at startup and when the setting changes. */
export function setCurrentLang(next: Lang): void {
  lang = next;
}

/** For dates and numbers: "en-US" or "es". (The phone's region still decides 12/24-hour time.) */
export function locale(l: Lang = lang): string {
  return l === "es" ? "es" : "en-US";
}

function fill(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** The wording for `key` in the current language (English if missing). */
export function t(key: StringKey, params?: Record<string, string | number>, l: Lang = lang): string {
  return fill(dictionaries[l][key] ?? dictionaries.en[key] ?? key, params);
}

/** Plural: uses "key_one" when count is 1, else "key_other"; {count} is filled in. */
export function tn(key: string, count: number, params?: Record<string, string | number>, l: Lang = lang): string {
  const k = `${key}_${count === 1 ? "one" : "other"}` as StringKey;
  return t(k, { count, ...params }, l);
}

/** Every key, for tests. */
export function allKeys(l: Lang): string[] {
  return Object.keys(dictionaries[l]);
}
