import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { matchesSearch, normalize } from "../../src/lib/prayerSearch";

const post = (over: Partial<{ notes: string; answerNote: string | null; place: string | null; verseRef: string | null }> = {}) => ({
  notes: "For Mum's surgery on Thursday",
  answerNote: null,
  place: null,
  verseRef: null,
  ...over,
});

describe("search my prayers", () => {
  test("finds words in the notes, any order, any case", () => {
    expect(matchesSearch(post(), "mum")).toBe(true);
    expect(matchesSearch(post(), "THURSDAY surgery")).toBe(true);
    expect(matchesSearch(post(), "job")).toBe(false);
    expect(matchesSearch(post(), "   ")).toBe(false);
  });

  test("also the answered note, the place and the verse (English or Spanish)", () => {
    expect(matchesSearch(post({ answerNote: "She's home and resting" }), "resting")).toBe(true);
    expect(matchesSearch(post({ place: "Austin, Texas" }), "austin")).toBe(true);
    expect(matchesSearch(post({ verseRef: "PHP.4.6-7" }), "philippians")).toBe(true);
    expect(matchesSearch(post({ verseRef: "PHP.4.6-7" }), "filipenses")).toBe(true);
  });

  test("accents don't matter", () => {
    expect(normalize("Oración")).toBe("oracion");
    expect(matchesSearch(post({ notes: "Oración por mi mamá" }), "mama oracion")).toBe(true);
  });

  test("only ever my own posts (authorId == me), the existing query shape", () => {
    const tab = readFileSync("src/app/(tabs)/prayers.tsx", "utf8");
    expect(tab).toContain("watchFilteredPosts(db, uid, NO_FILTER, SEARCH_LIMIT");
  });
});
