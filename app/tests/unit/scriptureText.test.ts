import { describe, expect, test } from "vitest";
import { BOOKS } from "../../src/lib/scripture/books";
import { KJV_BOOKS } from "../../src/lib/scripture/kjv";
import { getPassage, plainText, segmentsOf, TranslationUnavailableError } from "../../src/lib/scripture/text";

describe("bundled KJV text", () => {
  test("every book is present with exactly the versification in books.ts", async () => {
    let total = 0;
    for (const book of BOOKS) {
      const chapters = (await KJV_BOOKS[book.id]()).default;
      expect(chapters.map((c) => c.length), book.id).toEqual(book.verses);
      for (const c of chapters) for (const v of c) {
        expect(v.trim().length, book.id).toBeGreaterThan(0);
        expect(v).not.toContain("#");
      }
      total += chapters.reduce((n, c) => n + c.length, 0);
    }
    expect(total).toBe(31102);
  });

  test("keeps the KJV's LORD / GOD and supplied words", async () => {
    const ps23 = await getPassage("PSA.23.1", "KJV");
    expect(plainText(ps23.verses[0].segments)).toBe("The LORD is my shepherd; I shall not want.");
    expect(ps23.verses[0].segments).toContainEqual({ text: "is", supplied: true });
    const gen15 = await getPassage("GEN.15.2", "KJV");
    expect(plainText(gen15.verses[0].segments)).toContain("Lord GOD");
  });
});

describe("getPassage", () => {
  test("verse range", async () => {
    const p = await getPassage("PHP.4.6-7", "KJV");
    expect(p.reference).toBe("Philippians 4:6-7");
    expect(p.verses.map((v) => [v.chapter, v.verse])).toEqual([[4, 6], [4, 7]]);
    expect(plainText(p.verses[0].segments)).toMatch(/^Be careful for nothing; but in every thing by prayer/);
  });

  test("cross-chapter range and whole chapter", async () => {
    const cross = await getPassage("JHN.3.35-4.2", "KJV");
    expect(cross.verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual(["3:35", "3:36", "4:1", "4:2"]);
    const whole = await getPassage("PSA.117", "KJV");
    expect(whole.reference).toBe("Psalm 117");
    expect(whole.verses).toHaveLength(2);
  });

  test("John 11:35", async () => {
    const p = await getPassage("JHN.11.35", "KJV");
    expect(plainText(p.verses[0].segments)).toBe("Jesus wept.");
  });

  test("rejects non-canonical ids and unavailable translations", async () => {
    await expect(getPassage("Philippians 4:6", "KJV")).rejects.toThrow();
    await expect(getPassage("PHP.4.99", "KJV")).rejects.toThrow();
    await expect(getPassage("PHP.4.6", "NIV" as never)).rejects.toBeInstanceOf(TranslationUnavailableError);
  });
});

test("segmentsOf", () => {
  expect(segmentsOf("The LORD [is] my shepherd")).toEqual([
    { text: "The LORD ", supplied: false },
    { text: "is", supplied: true },
    { text: " my shepherd", supplied: false },
  ]);
  expect(segmentsOf("no brackets")).toEqual([{ text: "no brackets", supplied: false }]);
});
