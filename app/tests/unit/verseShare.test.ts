import { describe, expect, test } from "vitest";
import { getPassage } from "../../src/lib/scripture/text";
import { verseShareText } from "../../src/lib/verseShare";

describe("sharing a verse", () => {
  test("the text and its reference, nothing else", async () => {
    expect(verseShareText(await getPassage("PSA.46.10", "KJV"))).toBe(
      "Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.\n— Psalm 46:10 (KJV)",
    );
  });

  test("several verses are numbered", async () => {
    const text = verseShareText(await getPassage("PHP.4.6-7", "KJV"));
    expect(text).toMatch(/^6 Be careful for nothing.* 7 And the peace of God/);
    expect(text.endsWith("— Philippians 4:6-7 (KJV)")).toBe(true);
  });

  test("in Spanish for the Reina-Valera", async () => {
    expect(verseShareText(await getPassage("PSA.46.10", "RV1909"))).toMatch(/^Estad quietos.*\n— Salmo 46:10 \(RV1909\)$/);
  });
});
