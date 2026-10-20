import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { allKeys, setCurrentLang, SPANISH_REVIEWED, t, tn } from "../../src/i18n";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("wording in English and Spanish", () => {
  test("every key exists in both languages, never empty", () => {
    expect(allKeys("es").sort()).toEqual(allKeys("en").sort());
    for (const k of allKeys("en")) {
      expect(t(k as never, undefined, "en").trim(), k).not.toBe("");
      expect(t(k as never, undefined, "es").trim(), k).not.toBe("");
    }
  });

  test("the Spanish keeps the same {placeholders}", () => {
    for (const k of allKeys("en")) {
      expect(placeholders(t(k as never, undefined, "es")), k).toEqual(placeholders(t(k as never, undefined, "en")));
    }
  });

  test("plurals come in pairs", () => {
    const keys = new Set(allKeys("en"));
    for (const k of keys) {
      if (k.endsWith("_one")) expect(keys.has(k.replace(/_one$/, "_other")), k).toBe(true);
      if (k.endsWith("_other")) expect(keys.has(k.replace(/_other$/, "_one")), k).toBe(true);
    }
  });

  test("no Spanish text is accidentally left in English (other than names and shared words)", () => {
    const same = allKeys("en").filter((k) => t(k as never, undefined, "en") === t(k as never, undefined, "es") && /[a-z]{4,}/i.test(t(k as never, undefined, "en")));
    // Words that really are the same in both languages. Keep this list short and reviewed.
    const SAME_IN_BOTH = ["speed.normal", "voice.premiumName"];
    expect(same.filter((k) => !SAME_IN_BOTH.includes(k))).toEqual([]);
  });

  test("the current language switches the wording", () => {
    setCurrentLang("es");
    expect(t("common.cancel")).toBe("Cancelar");
    setCurrentLang("en");
    expect(t("common.cancel")).toBe("Cancel");
    expect(tn("missing", 2)).toBe("missing_other");
  });

  test("Spanish system texts are switched on together with the app's Spanish", () => {
    const config = readFileSync("app.config.ts", "utf8");
    expect(config).toContain(`const spanishReviewed = ${SPANISH_REVIEWED};`);
    const es = JSON.parse(readFileSync("locales/es.json", "utf8"));
    for (const key of ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSLocationWhenInUseUsageDescription", "NSMotionUsageDescription"]) {
      expect(es[key], key).toBeTruthy();
      expect(config, key).toBeTruthy();
    }
  });
});
