import { KJV_BOOKS } from "./kjv";
import { chapterTitle, formatReference, parseRefId, type VerseRef } from "./reference";
import type { TranslationId } from "./translations";

/** Part of a verse. `supplied` = words the KJV prints in italics. */
export type Segment = { text: string; supplied: boolean };
export type PassageVerse = { chapter: number; verse: number; segments: Segment[] };
export type Passage = {
  refId: string;
  reference: string; // "Philippians 4:6-7"
  translation: TranslationId;
  verses: PassageVerse[];
};

export class TranslationUnavailableError extends Error {
  constructor(translation: string) {
    super(`Translation ${translation} is not available.`);
    this.name = "TranslationUnavailableError";
  }
}

/** "The LORD [is] my shepherd" -> plain, italic "is", plain */
export function segmentsOf(raw: string): Segment[] {
  const out: Segment[] = [];
  for (const part of raw.split(/(\[[^\]]*\])/)) {
    if (!part) continue;
    const supplied = part.startsWith("[") && part.endsWith("]");
    const text = (supplied ? part.slice(1, -1) : part).replace(/\s{2,}/g, " ");
    if (text) out.push({ text, supplied });
  }
  return out;
}

/** Plain text of a verse (for accessibility labels, sharing, tests). */
export const plainText = (segments: Segment[]) => segments.map((s) => s.text).join("");

async function kjvChapters(book: string): Promise<string[][]> {
  const load = KJV_BOOKS[book];
  if (!load) throw new Error(`No KJV text for ${book}`);
  return (await load()).default;
}

function* versesOf(ref: VerseRef, chapters: string[][]) {
  for (let c = ref.startChapter; c <= ref.endChapter; c++) {
    const from = c === ref.startChapter ? ref.startVerse : 1;
    const to = c === ref.endChapter ? ref.endVerse : chapters[c - 1].length;
    for (let v = from; v <= to; v++) yield { chapter: c, verse: v, raw: chapters[c - 1][v - 1] };
  }
}

/**
 * The text of a stored reference in the viewer's translation. Only the
 * reference is ever stored; this runs at display time, per viewer.
 * KJV is bundled with the app (public domain). Licensed translations will
 * come through a provider once their terms are known.
 */
export async function getPassage(refId: string, translation: TranslationId): Promise<Passage> {
  const ref = parseRefId(refId);
  if (translation !== "KJV") throw new TranslationUnavailableError(translation);
  const chapters = await kjvChapters(ref.book);
  return {
    refId,
    reference: formatReference(ref),
    translation,
    verses: [...versesOf(ref, chapters)].map(({ chapter, verse, raw }) => ({ chapter, verse, segments: segmentsOf(raw) })),
  };
}

export type Chapter = {
  book: string;
  chapter: number;
  /** "Psalm 145" */
  title: string;
  translation: TranslationId;
  verses: PassageVerse[];
  /** Chapters in the book, for next/previous. */
  chapters: number;
};

/** A whole chapter of the bundled KJV ("Read more"). No network. */
export async function getChapter(book: string, chapter: number, translation: TranslationId): Promise<Chapter> {
  if (translation !== "KJV") throw new TranslationUnavailableError(translation);
  const chapters = await kjvChapters(book);
  const verses = chapters[chapter - 1];
  if (!verses) throw new Error(`${book} has no chapter ${chapter}`);
  return {
    book,
    chapter,
    title: chapterTitle(book, chapter),
    translation,
    verses: verses.map((raw, i) => ({ chapter, verse: i + 1, segments: segmentsOf(raw) })),
    chapters: chapters.length,
  };
}

/** Which verses of `chapter` the reference covers (to highlight and scroll to). */
export function versesInChapter(refId: string, chapter: number): { first: number; last: number } | null {
  const ref = parseRefId(refId);
  if (ref.wholeChapter || chapter < ref.startChapter || chapter > ref.endChapter) return null;
  return {
    first: chapter === ref.startChapter ? ref.startVerse : 1,
    last: chapter === ref.endChapter ? ref.endVerse : Number.MAX_SAFE_INTEGER,
  };
}
