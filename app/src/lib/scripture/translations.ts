/**
 * Translations a user can choose. Must match allowedTranslations() in
 * firebase/firestore.rules (a unit test checks this). Licensed translations
 * are added only once their licence terms allow this use.
 */
/** addedWords: marks the translators' added words (shown in italics). */
export const TRANSLATIONS = [
  { id: "KJV", name: "King James Version", language: "en", licence: "public domain", addedWords: true },
  { id: "BSB", name: "Berean Standard Bible", language: "en", licence: "public domain (eBible.org)", addedWords: false },
  { id: "WEB", name: "World English Bible", language: "en", licence: "public domain (eBible.org)", addedWords: false },
  { id: "ASV", name: "American Standard Version", language: "en", licence: "public domain (eBible.org)", addedWords: true },
  { id: "YLT", name: "Young's Literal Translation", language: "en", licence: "public domain (eBible.org)", addedWords: true },
  { id: "DARBY", name: "Darby Translation", language: "en", licence: "public domain (eBible.org)", addedWords: true },
  { id: "WEBSTER", name: "Webster Bible", language: "en", licence: "public domain (eBible.org)", addedWords: true },
  { id: "DRA", name: "Douay-Rheims", language: "en", licence: "public domain (eBible.org)", addedWords: false },
  { id: "RV1909", name: "Reina-Valera 1909", language: "es", licence: "public domain (eBible.org)", addedWords: true },
] as const;

export type TranslationId = (typeof TRANSLATIONS)[number]["id"];

export const DEFAULT_TRANSLATION: TranslationId = "KJV";

export function isTranslationId(id: unknown): id is TranslationId {
  return TRANSLATIONS.some((t) => t.id === id);
}
