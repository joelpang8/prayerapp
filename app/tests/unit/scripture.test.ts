import { describe, expect, test } from "vitest";
import { BOOKS } from "../../src/lib/scripture/books";
import {
  formatReference, parseRefId, parseReference, REF_ID_PATTERN, toApiBiblePassageId, toRefId, verseCount, VerseRefError,
} from "../../src/lib/scripture/reference";

describe("KJV versification table", () => {
  test("matches the published KJV totals", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.reduce((n, b) => n + b.verses.length, 0)).toBe(1189);
    expect(BOOKS.reduce((n, b) => n + b.verses.reduce((x, y) => x + y, 0), 0)).toBe(31102);
  });

  test("well-known facts", () => {
    const book = (id: string) => BOOKS.find((b) => b.id === id)!;
    expect(book("PSA").verses).toHaveLength(150);
    expect(book("PSA").verses[118]).toBe(176); // Psalm 119
    expect(book("PSA").verses[116]).toBe(2); // Psalm 117
    expect(book("JHN").verses[10]).toBe(57); // John 11 (11:35 "Jesus wept.")
    expect(book("MAL").verses).toHaveLength(4); // KJV has Malachi 4
    expect(book("3JN").verses).toEqual([14]); // KJV numbering
    expect(book("ROM").verses[15]).toBe(27);
    expect(book("PHP").verses[3]).toBe(23);
  });

  test("no alias belongs to two books", () => {
    const seen = new Map<string, string>();
    for (const b of BOOKS) for (const a of b.aliases) {
      expect(seen.get(a), `alias ${a}`).toBeUndefined();
      seen.set(a, b.id);
    }
  });

  test("every book id fits the stored-id pattern", () => {
    for (const b of BOOKS) expect(REF_ID_PATTERN.test(`${b.id}.1`), b.id).toBe(true);
  });
});

describe("parseReference", () => {
  const cases: [string, string, string][] = [
    // input, canonical id, display
    ["Philippians 4:6-7", "PHP.4.6-7", "Philippians 4:6-7"],
    ["phil 4.6–7", "PHP.4.6-7", "Philippians 4:6-7"],
    ["Php. 4 : 6 — 7", "PHP.4.6-7", "Philippians 4:6-7"],
    ["John 3:16", "JHN.3.16", "John 3:16"],
    ["Jn 3:16-4:2", "JHN.3.16-4.2", "John 3:16-4:2"],
    ["Psalm 23", "PSA.23", "Psalm 23"],
    ["Psalms 23:1-6", "PSA.23.1-6", "Psalm 23:1-6"],
    ["Ps 119:105", "PSA.119.105", "Psalm 119:105"],
    ["1 John 1:9", "1JN.1.9", "1 John 1:9"],
    ["1Jn 1:9", "1JN.1.9", "1 John 1:9"],
    ["First John 1:9", "1JN.1.9", "1 John 1:9"],
    ["I John 1:9", "1JN.1.9", "1 John 1:9"],
    ["III John 1:2", "3JN.1.2", "3 John 1:2"],
    ["2nd Corinthians 12:9", "2CO.12.9", "2 Corinthians 12:9"],
    ["Isaiah 40:31", "ISA.40.31", "Isaiah 40:31"],
    ["Is 53:5", "ISA.53.5", "Isaiah 53:5"],
    ["Song of Songs 2:4", "SNG.2.4", "Song of Solomon 2:4"],
    ["Revelations 21:4", "REV.21.4", "Revelation 21:4"],
    ["Jude 3", "JUD.1.3", "Jude 1:3"],
    ["Jude 1:3", "JUD.1.3", "Jude 1:3"],
    ["Jude 24-25", "JUD.1.24-25", "Jude 1:24-25"],
    ["Jude 1", "JUD.1", "Jude 1"],
    ["Obadiah 1:4", "OBA.1.4", "Obadiah 1:4"],
    ["  matthew   6 : 9 - 13  ", "MAT.6.9-13", "Matthew 6:9-13"],
  ];

  test.each(cases)("%j -> %s", (input, id, display) => {
    const ref = parseReference(input);
    expect(toRefId(ref)).toBe(id);
    expect(formatReference(ref)).toBe(display);
    // Canonical id and display both round-trip.
    expect(parseRefId(id)).toEqual(ref);
    expect(toRefId(parseReference(display))).toBe(id);
  });

  test.each([
    ["Philippians 4:24", /23 verses/],
    ["Philippians 5:1", /4 chapters/],
    ["Psalm 151", /150 chapters/],
    ["3 John 1:15", /14 verses/],
    ["John 3:18-16", /ends before/],
    ["John 4:1-3:16", /ends before/],
    ["Hezekiah 1:1", /Unknown book/],
    ["John", /Couldn't read/],
    ["John 3:16; 4:1", /one passage/],
    ["John 3:16, 18", /one passage/],
    ["Psalm 23-24", /whole chapters/],
    ["John 0:1", /no chapter 0/],
    ["John 3:0", /no verse 0/],
    ["", /Couldn't read/],
  ])("rejects %j", (input, message) => {
    expect(() => parseReference(input)).toThrow(VerseRefError);
    expect(() => parseReference(input)).toThrow(message);
  });
});

describe("canonical ids", () => {
  test("strict: only the canonical spelling of an existing passage", () => {
    for (const bad of ["PHP.4.6-6", "JHN.3.16-3.18", "php.4.6", "PHP 4:6", "PHP.4.24", "XYZ.1.1", "PHP.4.6-", "PSA.151", ""]) {
      expect(() => parseRefId(bad), bad).toThrow(VerseRefError);
    }
  });

  test("verse counts (for licence caps on consecutive verses)", () => {
    expect(verseCount(parseReference("John 3:16"))).toBe(1);
    expect(verseCount(parseReference("Philippians 4:6-7"))).toBe(2);
    expect(verseCount(parseReference("Psalm 119"))).toBe(176);
    expect(verseCount(parseReference("John 3:35-4:2"))).toBe(4); // 3:35, 3:36, 4:1, 4:2
    expect(verseCount(parseReference("Genesis 1:1-3:24"))).toBe(31 + 25 + 24);
  });

  test("API.Bible passage ids", () => {
    expect(toApiBiblePassageId(parseReference("Philippians 4:6-7"))).toBe("PHP.4.6-PHP.4.7");
    expect(toApiBiblePassageId(parseReference("John 3:16"))).toBe("JHN.3.16-JHN.3.16");
    expect(toApiBiblePassageId(parseReference("Psalm 23"))).toBe("PSA.23");
  });
});
