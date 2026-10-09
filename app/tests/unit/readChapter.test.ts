import { describe, expect, test } from "vitest";
import { chapterTitle } from "../../src/lib/scripture/reference";
import { getChapter, plainText, versesInChapter } from "../../src/lib/scripture/text";

describe("Read more: whole chapters from the bundled KJV", () => {
  test("Psalm 145 with its supplied words marked, and how many psalms there are", async () => {
    const c = await getChapter("PSA", 145, "KJV");
    expect(c.title).toBe("Psalm 145");
    expect(c.chapters).toBe(150);
    expect(c.verses).toHaveLength(21);
    const v18 = c.verses[17];
    expect(v18.verse).toBe(18);
    expect(plainText(v18.segments)).toBe("The LORD is nigh unto all them that call upon him, to all that call upon him in truth.");
    expect(v18.segments).toContainEqual({ text: "is", supplied: true });
    // No markup left in the text.
    expect(c.verses.every((v) => !/[[\]]/.test(plainText(v.segments)))).toBe(true);
  });

  test("first and last chapters of a book; no chapter past the end", async () => {
    expect((await getChapter("PHP", 1, "KJV")).chapters).toBe(4);
    expect((await getChapter("JUD", 1, "KJV")).chapters).toBe(1);
    await expect(getChapter("PHP", 5, "KJV")).rejects.toThrow();
  });

  test("only the bundled KJV (no network)", async () => {
    await expect(getChapter("PSA", 23, "ESV" as never)).rejects.toThrow(/not available/);
  });

  test("which verses to highlight in each chapter", () => {
    expect(versesInChapter("PSA.145.18", 145)).toEqual({ first: 18, last: 18 });
    expect(versesInChapter("PHP.4.6-7", 4)).toEqual({ first: 6, last: 7 });
    expect(versesInChapter("PHP.4.6-7", 3)).toBeNull();
    expect(versesInChapter("JHN.3.16-4.2", 3)).toEqual({ first: 16, last: Number.MAX_SAFE_INTEGER });
    expect(versesInChapter("JHN.3.16-4.2", 4)).toEqual({ first: 1, last: 2 });
    expect(versesInChapter("PSA.23", 23)).toBeNull(); // a whole chapter: nothing singled out
  });

  test("chapter headings", () => {
    expect(chapterTitle("PSA", 23)).toBe("Psalm 23");
    expect(chapterTitle("1JN", 1)).toBe("1 John 1");
  });
});
