import { describe, expect, test } from "vitest";
import { BOOKS } from "../../src/lib/scripture/books";
import { KJV_BOOKS } from "../../src/lib/scripture/kjv";
import { ASV_BOOKS } from "../../src/lib/scripture/asv";
import { BSB_BOOKS } from "../../src/lib/scripture/bsb";
import { DARBY_BOOKS } from "../../src/lib/scripture/darby";
import { DRA_BOOKS, DRA_NUMBERED_DIFFERENTLY } from "../../src/lib/scripture/dra";
import { RV1909_BOOKS, RV1909_NUMBERED_DIFFERENTLY } from "../../src/lib/scripture/rv1909";
import { WEB_BOOKS } from "../../src/lib/scripture/web";
import { WEBSTER_BOOKS } from "../../src/lib/scripture/webster";
import { YLT_BOOKS } from "../../src/lib/scripture/ylt";
import { getChapter, getPassage, plainText, segmentsOf, TranslationUnavailableError } from "../../src/lib/scripture/text";

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

describe("bundled Reina-Valera 1909 (Spanish)", () => {
  test("every book is present with the same versification as the KJV", async () => {
    let total = 0;
    for (const book of BOOKS) {
      const chapters = (await RV1909_BOOKS[book.id]()).default;
      expect(chapters.map((c) => c.length), book.id).toEqual(book.verses);
      chapters.forEach((c, i) => {
        // Empty only in chapters numbered differently (shown in the KJV instead).
        if (c.some((v) => !v.trim())) expect(RV1909_NUMBERED_DIFFERENTLY[book.id], `${book.id} ${i + 1}`).toContain(i + 1);
      });
      total += chapters.reduce((n, c) => n + c.length, 0);
    }
    expect(total).toBe(31102);
  });

  test("the same reference in Spanish, with added words in italics", async () => {
    const p = await getPassage("PSA.46.10", "RV1909");
    expect(p.translation).toBe("RV1909");
    expect(plainText(p.verses[0].segments)).toBe("Estad quietos, y conoced que yo soy Dios: ensalzado he de ser entre las gentes, ensalzado seré en la tierra.");
    const gen = await getPassage("GEN.1.9", "RV1909");
    expect(gen.verses[0].segments.some((s) => s.supplied && s.text === "están")).toBe(true);
    const cross = await getPassage("JHN.3.35-4.2", "RV1909");
    expect(cross.verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual(["3:35", "3:36", "4:1", "4:2"]);
  });
});

test("chapters numbered differently in Spanish show the KJV, labelled KJV", async () => {
  const jonah = await getPassage("JON.1.17", "RV1909");
  expect(jonah.translation).toBe("KJV");
  expect(plainText(jonah.verses[0].segments)).toMatch(/^Now the LORD had prepared a great fish/);
  expect((await getChapter("JOB", 39, "RV1909")).translation).toBe("KJV");
  expect((await getChapter("JOB", 37, "RV1909")).translation).toBe("RV1909");
  expect((await getPassage("PSA.46.10", "RV1909")).translation).toBe("RV1909");
});

describe("bundled modern English: Berean Standard Bible and World English Bible", () => {
  const OMITTED = {
    BSB: ["MAT 17:21", "MAT 18:11", "MAT 23:14", "MRK 7:16", "MRK 9:44", "MRK 9:46", "MRK 11:26", "MRK 15:28", "LUK 17:36", "LUK 23:17", "JHN 5:4", "ACT 8:37", "ACT 15:34", "ACT 24:7", "ACT 28:29", "ROM 16:24"],
    WEB: ["LUK 17:36", "ACT 8:37", "ACT 15:34", "ACT 24:7"],
  };
  const LOADERS = { BSB: BSB_BOOKS, WEB: WEB_BOOKS };

  test.each(["BSB", "WEB"] as const)("%s: KJV numbering, every verse present except the few it leaves out", async (id) => {
    const empty: string[] = [];
    for (const book of BOOKS) {
      const chapters = (await LOADERS[id][book.id]()).default;
      expect(chapters.map((c) => c.length), `${id} ${book.id}`).toEqual(book.verses);
      chapters.forEach((c, ci) => c.forEach((v, vi) => { if (!v.trim()) empty.push(`${book.id} ${ci + 1}:${vi + 1}`); }));
    }
    expect(empty).toEqual(OMITTED[id]);
  });

  test("the same reference in each translation", async () => {
    expect(plainText((await getPassage("PHP.4.6", "BSB")).verses[0].segments)).toBe("Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.");
    expect(plainText((await getPassage("PHP.4.6", "WEB")).verses[0].segments)).toBe("In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.");
    expect((await getPassage("PHP.4.6", "BSB")).translation).toBe("BSB");
  });

  test("left-out verses are skipped; a reference made only of them shows the KJV", async () => {
    const p = await getPassage("MAT.17.20-22", "BSB");
    expect(p.translation).toBe("BSB");
    expect(p.verses.map((v) => v.verse)).toEqual([20, 22]);
    const only = await getPassage("ACT.8.37", "WEB");
    expect(only.translation).toBe("KJV");
    expect(plainText(only.verses[0].segments)).toMatch(/^And Philip said/);
    const chapter = await getChapter("MRK", 9, "BSB");
    expect(chapter.translation).toBe("BSB");
    expect(chapter.verses.map((v) => v.verse)).not.toContain(44);
    expect(chapter.verses).toHaveLength(48);
  });

  test("the WEB's closing doxology of Romans is found at 16:25-27, as in the KJV", async () => {
    const p = await getPassage("ROM.16.25-27", "WEB");
    expect(p.translation).toBe("WEB");
    expect(plainText(p.verses[0].segments)).toMatch(/^Now to him who is able to establish you/);
    expect((await getChapter("ROM", 14, "WEB")).verses).toHaveLength(23);
  });
});

describe("older public-domain English: ASV, Young's Literal, Darby, Webster", () => {
  const OMITTED = {
    ASV: ["MAT 17:21", "MAT 18:11", "MAT 23:14", "MRK 7:16", "MRK 9:44", "MRK 9:46", "MRK 11:26", "MRK 15:28", "LUK 17:36", "LUK 23:17", "JHN 5:4", "ACT 8:37", "ACT 15:34", "ACT 24:7", "ACT 28:29", "ROM 16:24"],
    YLT: [],
    DARBY: ["MAT 23:14", "ACT 8:37", "ACT 15:34"],
    WEBSTER: [],
  };
  const LOADERS = { ASV: ASV_BOOKS, YLT: YLT_BOOKS, DARBY: DARBY_BOOKS, WEBSTER: WEBSTER_BOOKS };

  test.each(["ASV", "YLT", "DARBY", "WEBSTER"] as const)("%s: KJV numbering, every verse present except the few it leaves out", async (id) => {
    const empty: string[] = [];
    for (const book of BOOKS) {
      const chapters = (await LOADERS[id][book.id]()).default;
      expect(chapters.map((c) => c.length), `${id} ${book.id}`).toEqual(book.verses);
      chapters.forEach((c, ci) => c.forEach((v, vi) => { if (!v.trim()) empty.push(`${book.id} ${ci + 1}:${vi + 1}`); }));
    }
    expect(empty).toEqual(OMITTED[id]);
  });

  test("their added words are in italics", async () => {
    const p = await getPassage("GEN.1.4", "WEBSTER");
    expect(p.translation).toBe("WEBSTER");
    expect(p.verses[0].segments.some((s) => s.supplied && s.text === "it was")).toBe(true);
    expect(plainText((await getPassage("PSA.23.1", "ASV")).verses[0].segments)).toMatch(/Jehovah is my shepherd/);
  });
});

describe("Douay-Rheims (Vulgate numbering matched to the KJV's)", () => {
  test("matched chapters have the KJV's verse counts; the rest are empty and listed", async () => {
    let shownInKjv = 0;
    for (const book of BOOKS) {
      const chapters = (await DRA_BOOKS[book.id]()).default;
      expect(chapters).toHaveLength(book.verses.length);
      chapters.forEach((c, ci) => {
        const listed = DRA_NUMBERED_DIFFERENTLY[book.id]?.includes(ci + 1) ?? false;
        if (listed) { shownInKjv++; expect(c, `${book.id} ${ci + 1}`).toEqual([]); }
        else expect(c.length, `${book.id} ${ci + 1}`).toBe(book.verses[ci]);
      });
    }
    // Most chapters are its own text.
    expect(shownInKjv).toBeLessThan(200);
  });

  test("psalms are found by their KJV numbers, without the titles printed as verses", async () => {
    expect(plainText((await getPassage("PSA.46.10", "DRA")).verses[0].segments)).toBe("Be still and see that I am God; I will be exalted among the nations, and I will be exalted in the earth.");
    expect(plainText((await getPassage("PSA.51.10", "DRA")).verses[0].segments)).toMatch(/^Create a clean heart in me, O God/);
    expect(plainText((await getPassage("PSA.23.4", "DRA")).verses[0].segments)).toMatch(/shadow of death/);
    expect((await getPassage("PSA.23.1", "DRA")).translation).toBe("DRA");
  });

  test("psalms numbered as one in the Vulgate but two in the KJV (9-10) show the KJV", async () => {
    const p = await getPassage("PSA.10.1", "DRA");
    expect(p.translation).toBe("KJV");
    expect((await getChapter("PSA", 9, "DRA")).translation).toBe("KJV");
    expect(DRA_NUMBERED_DIFFERENTLY.PSA).toEqual(expect.arrayContaining([9, 10, 114, 115, 116, 147]));
  });
});
