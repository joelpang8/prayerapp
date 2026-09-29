import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkVerseList, toVerseListJson } from "../../src/lib/scripture/curatedList";

describe("checkVerseList", () => {
  test("normalizes entries, ignores comments and blank lines", () => {
    const r = checkVerseList("# my list\n\nphil 4.6–7   # peace\nPs 23\n");
    expect(r.errors).toEqual([]);
    expect(r.entries.map((e) => [e.line, e.id, e.display])).toEqual([
      [3, "PHP.4.6-7", "Philippians 4:6-7"],
      [4, "PSA.23", "Psalm 23"],
    ]);
  });

  test("errors carry line numbers and readable reasons", () => {
    const r = checkVerseList("John 3:16\nPhilippians 5:1\nHezekiah 1:1\nJohn 3:16; 4:1");
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[0].message).toMatch(/4 chapters/);
    expect(r.errors[1].message).toMatch(/Unknown book/);
    expect(r.entries).toHaveLength(1);
  });

  test("the same passage twice, in any spelling, is an error", () => {
    const r = checkVerseList("Philippians 4:6-7\nPhil 4:6-7");
    expect(r.errors).toEqual([{ line: 2, message: "Philippians 4:6-7 is already on line 1." }]);
  });

  test("overlapping passages and long passages are warnings", () => {
    const r = checkVerseList("John 3:16\nJohn 3:14-17\nPsalm 119");
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.line)).toEqual([2, 3]);
    expect(r.warnings[0].message).toMatch(/overlaps John 3:16/);
    expect(r.warnings[1].message).toMatch(/176 verses/);
  });

  test("an optional licence cap on passage length", () => {
    const r = checkVerseList("Matthew 6:9-13\nJohn 3:16", { maxVerses: 3 });
    expect(r.errors).toEqual([{ line: 1, message: "Matthew 6:9-13 is 5 verses; the limit is 3." }]);
  });
});

test("the committed verse list is valid and verse-list.json is in sync with it", () => {
  const root = join(__dirname, "../../..");
  const report = checkVerseList(readFileSync(join(root, "firebase/verses/verses.txt"), "utf8"));
  expect(report.errors).toEqual([]);
  expect(report.entries.length).toBeGreaterThan(0);
  expect(readFileSync(join(root, "firebase/functions/src/verse-list.json"), "utf8")).toBe(toVerseListJson(report));
});
