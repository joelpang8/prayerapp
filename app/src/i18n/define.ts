/**
 * One area's wording, in English and Spanish. The Spanish must have every
 * English key (TypeScript checks), so nothing is left untranslated.
 * Placeholders look like {name}; plurals are two keys, "x_one" and "x_other".
 */
export function defineStrings<const T extends Record<string, string>>(en: T, es: { [K in keyof T]: string }) {
  return { en, es };
}
