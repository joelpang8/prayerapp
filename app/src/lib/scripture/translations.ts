/**
 * Translations a user can choose. Must match allowedTranslations() in
 * firebase/firestore.rules (a unit test checks this). Licensed translations
 * are added only once their licence terms allow this use.
 */
export const TRANSLATIONS = [
  { id: "KJV", name: "King James Version", licence: "public domain" },
] as const;

export type TranslationId = (typeof TRANSLATIONS)[number]["id"];

export const DEFAULT_TRANSLATION: TranslationId = "KJV";

export function isTranslationId(id: unknown): id is TranslationId {
  return TRANSLATIONS.some((t) => t.id === id);
}
