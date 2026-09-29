import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { DEFAULT_TRANSLATION, TRANSLATIONS } from "../../src/lib/scripture/translations";

test("app translation list matches the allowed list in firestore.rules", () => {
  const rules = readFileSync(join(__dirname, "../../../firebase/firestore.rules"), "utf8");
  const m = /function allowedTranslations\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules);
  expect(m, "allowedTranslations() not found in firestore.rules").not.toBeNull();
  const inRules = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  expect(TRANSLATIONS.map((t) => t.id).sort()).toEqual(inRules);
});

test("default is KJV (public domain, needs no licence)", () => {
  expect(DEFAULT_TRANSLATION).toBe("KJV");
});
