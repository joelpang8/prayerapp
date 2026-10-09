import { BOOKS, type Book } from "./books";

/**
 * A single passage: one verse, a range of verses, or one whole chapter,
 * always within one book. Posts and prompts store only this (as its id),
 * never verse text; the text is fetched per viewer, in that viewer's chosen
 * translation, when the post is shown.
 */
export type VerseRef = {
  book: string; // USFM code, e.g. "PHP"
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  /** True for "Psalm 23": displayed and stored as the chapter alone. */
  wholeChapter: boolean;
};

export class VerseRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerseRefError";
  }
}

const byId = new Map(BOOKS.map((b) => [b.id, b]));
const byAlias = new Map(BOOKS.flatMap((b) => b.aliases.map((a) => [a, b] as const)));

export function bookById(id: string): Book | undefined {
  return byId.get(id);
}

/** "First John", "1st John", "I John", "1 Jn." -> "1john" / "1jn" */
function normalizeBookName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\s*(first|1st|iii|ii|i|second|2nd|third|3rd)\b\.?/, (m) => {
      const w = m.trim().replace(".", "");
      return { first: "1", "1st": "1", i: "1", second: "2", "2nd": "2", ii: "2", third: "3", "3rd": "3", iii: "3" }[w] ?? w;
    })
    .replace(/[\s.]/g, "");
}

function findBook(raw: string): Book {
  const book = byAlias.get(normalizeBookName(raw));
  if (!book) throw new VerseRefError(`Unknown book "${raw.trim()}".`);
  return book;
}

function versesIn(book: Book, chapter: number): number {
  const n = book.verses[chapter - 1];
  if (!n) {
    throw new VerseRefError(
      `${book.name} has ${book.verses.length} chapter${book.verses.length === 1 ? "" : "s"}; there is no chapter ${chapter}.`,
    );
  }
  return n;
}

function checkVerse(book: Book, chapter: number, verse: number) {
  const n = versesIn(book, chapter);
  if (verse < 1 || verse > n) {
    throw new VerseRefError(`${displayChapterName(book, chapter)} has ${n} verses; there is no verse ${verse}.`);
  }
}

/** Validates bounds and ordering; returns the ref for chaining. */
export function validate(ref: VerseRef): VerseRef {
  const book = byId.get(ref.book);
  if (!book) throw new VerseRefError(`Unknown book code "${ref.book}".`);
  for (const n of [ref.startChapter, ref.startVerse, ref.endChapter, ref.endVerse]) {
    if (!Number.isInteger(n)) throw new VerseRefError("Chapter and verse numbers must be whole numbers.");
  }
  checkVerse(book, ref.startChapter, ref.startVerse);
  checkVerse(book, ref.endChapter, ref.endVerse);
  const start = ref.startChapter * 1000 + ref.startVerse;
  const end = ref.endChapter * 1000 + ref.endVerse;
  if (end < start) throw new VerseRefError("The range ends before it starts.");
  if (ref.wholeChapter) {
    const last = versesIn(book, ref.startChapter);
    if (ref.endChapter !== ref.startChapter || ref.startVerse !== 1 || ref.endVerse !== last) {
      throw new VerseRefError("A whole-chapter reference must cover exactly one chapter.");
    }
  }
  return ref;
}

const NUM = String.raw`(\d{1,3})`;
const SEP = String.raw`\s*[:.]\s*`;
const DASH = String.raw`\s*[-‐-―]\s*`;
// book, then: C | C:V | C:V-V | C:V-C:V | (single-chapter books) V | V-V
const REF = new RegExp(
  String.raw`^\s*(.+?)\s*${NUM}(?:${SEP}${NUM}(?:${DASH}${NUM}(?:${SEP}${NUM})?)?|${DASH}${NUM})?\s*$`,
);

/**
 * Parses a human-written reference: "Philippians 4:6-7", "Phil 4.6–7",
 * "1 Jn 1:9", "Psalm 23", "John 3:16-4:2", "Jude 3". Throws VerseRefError
 * with a readable message if it's malformed or doesn't exist in the KJV.
 * One passage only (no "John 3:16; 4:1").
 */
export function parseReference(input: string): VerseRef {
  if (/[;,]/.test(input)) throw new VerseRefError("Only one passage per reference.");
  const m = REF.exec(input);
  if (!m) throw new VerseRefError(`Couldn't read "${input.trim()}" as a Bible reference.`);
  const [, bookPart, a, b, c, d, dashOnly] = m;
  const book = findBook(bookPart);
  const n = (s: string) => Number(s);
  const singleChapterBook = book.verses.length === 1;

  let ref: VerseRef;
  if (b === undefined && dashOnly === undefined) {
    // "Psalm 23" (whole chapter), or "Jude 3" (verse 3 of a one-chapter book).
    ref = singleChapterBook && n(a) !== 1
      ? { book: book.id, startChapter: 1, startVerse: n(a), endChapter: 1, endVerse: n(a), wholeChapter: false }
      : { book: book.id, startChapter: n(a), startVerse: 1, endChapter: n(a), endVerse: versesIn(book, n(a)), wholeChapter: true };
  } else if (dashOnly !== undefined) {
    // "Jude 3-5": verses of a one-chapter book. "Psalm 23-24" isn't supported.
    if (!singleChapterBook) throw new VerseRefError("A range of whole chapters isn't supported. Pick one chapter or a verse range.");
    ref = { book: book.id, startChapter: 1, startVerse: n(a), endChapter: 1, endVerse: n(dashOnly), wholeChapter: false };
  } else if (c === undefined) {
    ref = { book: book.id, startChapter: n(a), startVerse: n(b), endChapter: n(a), endVerse: n(b), wholeChapter: false };
  } else if (d === undefined) {
    ref = { book: book.id, startChapter: n(a), startVerse: n(b), endChapter: n(a), endVerse: n(c), wholeChapter: false };
  } else {
    ref = { book: book.id, startChapter: n(a), startVerse: n(b), endChapter: n(c), endVerse: n(d), wholeChapter: false };
  }
  return validate(ref);
}

/** "Psalm 145", "Philippians 4": a chapter's heading. */
export function chapterTitle(bookId: string, chapter: number): string {
  return displayChapterName(byId.get(bookId)!, chapter);
}

function displayChapterName(book: Book, chapter: number): string {
  // "Psalm 23" for one psalm; the book itself is "Psalms".
  const name = book.id === "PSA" ? "Psalm" : book.name;
  return `${name} ${chapter}`;
}

/** "Philippians 4:6-7", "Psalm 23", "John 3:16-4:2", "Jude 1:3" */
export function formatReference(ref: VerseRef): string {
  const book = byId.get(ref.book)!;
  const head = displayChapterName(book, ref.startChapter);
  if (ref.wholeChapter) return head;
  if (ref.startChapter === ref.endChapter) {
    return ref.startVerse === ref.endVerse
      ? `${head}:${ref.startVerse}`
      : `${head}:${ref.startVerse}-${ref.endVerse}`;
  }
  return `${head}:${ref.startVerse}-${ref.endChapter}:${ref.endVerse}`;
}

/**
 * Canonical storage id, stable and unambiguous:
 *   "PHP.4.6"  "PHP.4.6-7"  "JHN.3.16-4.2"  "PSA.23"
 */
export function toRefId(ref: VerseRef): string {
  const base = `${ref.book}.${ref.startChapter}`;
  if (ref.wholeChapter) return base;
  if (ref.startChapter === ref.endChapter) {
    return ref.startVerse === ref.endVerse
      ? `${base}.${ref.startVerse}`
      : `${base}.${ref.startVerse}-${ref.endVerse}`;
  }
  return `${base}.${ref.startVerse}-${ref.endChapter}.${ref.endVerse}`;
}

/** Must match the pattern firestore.rules will use for stored ids. */
export const REF_ID_PATTERN = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3})(?:\.(\d{1,3}))?)?)?$/;

/** Strict inverse of toRefId: only canonical ids, validated. */
export function parseRefId(id: string): VerseRef {
  const m = REF_ID_PATTERN.exec(id);
  if (!m) throw new VerseRefError(`Not a canonical reference id: "${id}".`);
  const [, bookId, ch, v1, x, v2] = m;
  const book = byId.get(bookId);
  if (!book) throw new VerseRefError(`Unknown book code "${bookId}".`);
  const c = Number(ch);
  let ref: VerseRef;
  if (v1 === undefined) {
    ref = { book: bookId, startChapter: c, startVerse: 1, endChapter: c, endVerse: versesIn(book, c), wholeChapter: true };
  } else if (x === undefined) {
    ref = { book: bookId, startChapter: c, startVerse: Number(v1), endChapter: c, endVerse: Number(v1), wholeChapter: false };
  } else if (v2 === undefined) {
    ref = { book: bookId, startChapter: c, startVerse: Number(v1), endChapter: c, endVerse: Number(x), wholeChapter: false };
  } else {
    ref = { book: bookId, startChapter: c, startVerse: Number(v1), endChapter: Number(x), endVerse: Number(v2), wholeChapter: false };
  }
  validate(ref);
  // Reject non-canonical spellings of a valid ref, e.g. "PHP.4.6-6" or
  // "JHN.3.16-3.18" (canonical: "PHP.4.6", "JHN.3.16-18").
  if (toRefId(ref) !== id) throw new VerseRefError(`Not canonical; expected "${toRefId(ref)}".`);
  return ref;
}

/** Number of verses a reference covers (for licence caps on consecutive verses). */
export function verseCount(ref: VerseRef): number {
  const book = byId.get(ref.book)!;
  if (ref.startChapter === ref.endChapter) return ref.endVerse - ref.startVerse + 1;
  let total = book.verses[ref.startChapter - 1] - ref.startVerse + 1;
  for (let c = ref.startChapter + 1; c < ref.endChapter; c++) total += book.verses[c - 1];
  return total + ref.endVerse;
}

/**
 * API.Bible passage id, e.g. "PHP.4.6-PHP.4.7" or "PSA.23". Provider choice
 * is pending licensing answers; kept here because it's a pure mapping.
 */
export function toApiBiblePassageId(ref: VerseRef): string {
  if (ref.wholeChapter) return `${ref.book}.${ref.startChapter}`;
  return `${ref.book}.${ref.startChapter}.${ref.startVerse}-${ref.book}.${ref.endChapter}.${ref.endVerse}`;
}
