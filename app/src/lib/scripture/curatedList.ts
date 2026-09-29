import { formatReference, parseReference, toRefId, verseCount, VerseRefError, type VerseRef } from "./reference";

export type ListEntry = { line: number; input: string; id: string; display: string; verses: number };
export type ListIssue = { line: number; message: string };
export type ListReport = { entries: ListEntry[]; errors: ListIssue[]; warnings: ListIssue[] };

/** Passages longer than this get a warning: long to read under a prompt. */
export const LONG_PASSAGE = 8;

const span = (r: VerseRef) => [r.startChapter * 1000 + r.startVerse, r.endChapter * 1000 + r.endVerse] as const;

/**
 * Checks the curated verse list: one reference per line, "#" starts a
 * comment, blank lines ignored.
 *  errors:   unreadable or non-existent references, exact duplicates,
 *            passages over `maxVerses` (a licence cap, when there is one)
 *  warnings: long passages, overlapping passages
 */
export function checkVerseList(text: string, options: { maxVerses?: number } = {}): ListReport {
  const entries: ListEntry[] = [];
  const errors: ListIssue[] = [];
  const warnings: ListIssue[] = [];
  const parsed: { line: number; ref: VerseRef }[] = [];
  const firstLineOf = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const input = raw.replace(/#.*/, "").trim();
    if (!input) return;
    let ref: VerseRef;
    try {
      ref = parseReference(input);
    } catch (err) {
      if (!(err instanceof VerseRefError)) throw err;
      errors.push({ line, message: `"${input}": ${err.message}` });
      return;
    }
    const id = toRefId(ref);
    const display = formatReference(ref);
    const verses = verseCount(ref);
    const dup = firstLineOf.get(id);
    if (dup !== undefined) {
      errors.push({ line, message: `${display} is already on line ${dup}.` });
      return;
    }
    if (options.maxVerses !== undefined && verses > options.maxVerses) {
      errors.push({ line, message: `${display} is ${verses} verses; the limit is ${options.maxVerses}.` });
      return;
    }
    if (verses > LONG_PASSAGE) warnings.push({ line, message: `${display} is ${verses} verses long.` });
    for (const other of parsed) {
      if (other.ref.book !== ref.book) continue;
      const [a1, a2] = span(ref);
      const [b1, b2] = span(other.ref);
      if (a1 <= b2 && b1 <= a2) {
        warnings.push({ line, message: `${display} overlaps ${formatReference(other.ref)} (line ${other.line}).` });
      }
    }
    firstLineOf.set(id, line);
    parsed.push({ line, ref });
    entries.push({ line, input, id, display, verses });
  });

  return { entries, errors, warnings };
}

/** What the step 4 scheduler reads: the canonical ids, in list order. */
export function toVerseListJson(report: ListReport): string {
  return JSON.stringify({ generatedBy: "app/scripts/verses.ts", verses: report.entries.map((e) => e.id) }, null, 2) + "\n";
}
