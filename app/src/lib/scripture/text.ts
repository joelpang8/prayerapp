import { KJV_BOOKS } from "./kjv";
import { RV1909_BOOKS, RV1909_NUMBERED_DIFFERENTLY } from "./rv1909";
import { chapterTitle, formatReference, parseRefId, type VerseRef } from "./reference";
import { TRANSLATIONS, type TranslationId } from "./translations";

/** Part of a verse. `supplied` = words the translators added (printed in italics). */
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

// The bundled public-domain texts, one lazily loaded file per book.
const BUNDLED: Record<TranslationId, Record<string, () => Promise<{ default: string[][] }>>> = {
  KJV: KJV_BOOKS,
  RV1909: RV1909_BOOKS,
};

/**
 * The translation actually shown for these chapters: the Reina-Valera
 * numbers a few chapters differently from the KJV (whose numbering stored
 * references use), so there the KJV is shown instead, labelled KJV.
 */
export function shownTranslation(translation: TranslationId, book: string, chapters: readonly number[]): TranslationId {
  if (translation === "RV1909" && chapters.some((c) => RV1909_NUMBERED_DIFFERENTLY[book]?.includes(c))) return "KJV";
  return translation;
}

async function bookChapters(book: string, translation: TranslationId): Promise<string[][]> {
  const books = BUNDLED[translation];
  if (!books) throw new TranslationUnavailableError(translation);
  const load = books[book];
  if (!load) throw new Error(`No ${translation} text for ${book}`);
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
 * The KJV and the Reina-Valera 1909 are bundled with the app (public
 * domain). Licensed translations will come through a provider once their
 * terms are known.
 */
export async function getPassage(refId: string, translation: TranslationId): Promise<Passage> {
  const ref = parseRefId(refId);
  const span = Array.from({ length: ref.endChapter - ref.startChapter + 1 }, (_, i) => ref.startChapter + i);
  const shown = shownTranslation(translation, ref.book, span);
  const chapters = await bookChapters(ref.book, shown);
  return {
    refId,
    // A Spanish Bible names its books in Spanish; otherwise the app's language.
    reference: formatReference(ref, TRANSLATIONS.find((x) => x.id === shown)?.language === "es" ? "es" : undefined),
    translation: shown,
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

/** A whole chapter of a bundled translation ("Read more"). No network. */
export async function getChapter(book: string, chapter: number, requested: TranslationId): Promise<Chapter> {
  const translation = shownTranslation(requested, book, [chapter]);
  const chapters = await bookChapters(book, translation);
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
