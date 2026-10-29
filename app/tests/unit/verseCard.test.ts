import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cardFontSize, cardVerses, CARD_VERSES } from "../../src/lib/verseCard";

const verse = (n: number, text: string) => ({ chapter: 1, verse: n, segments: [{ text, supplied: false }] });

describe("Share a verse as a picture", () => {
  test("one verse: just its words", () => {
    const c = cardVerses({ verses: [verse(10, "Be still, and know that I am God")] });
    expect(c.text).toBe("Be still, and know that I am God");
    expect(c.more).toBe(false);
  });

  test("several verses are numbered; more than four end after the fourth", () => {
    const c = cardVerses({ verses: [1, 2, 3, 4, 5].map((n) => verse(n, `v${n}`)) });
    expect(c.text).toBe("1 v1 2 v2 3 v3 4 v4");
    expect(c.more).toBe(true);
    expect(CARD_VERSES).toBe(4);
  });

  test("longer text gets smaller type", () => {
    expect(cardFontSize("x".repeat(50))).toBeGreaterThan(cardFontSize("x".repeat(300)));
    expect(cardFontSize("x".repeat(900))).toBe(15);
  });

  test("the picture holds only the verse, its reference and the app's name", () => {
    const screen = readFileSync("src/app/verse-card/[ref].tsx", "utf8");
    expect(screen).not.toMatch(/useReadySession|displayName|notes|useMyPosts|useFeed/);
    expect(screen).toContain("releaseCapture(uri)");
  });
});
