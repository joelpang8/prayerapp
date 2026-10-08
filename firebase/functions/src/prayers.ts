/**
 * Pure helpers for the "I'll pray for this" taps and the verse index, kept
 * apart from the triggers so they can be unit tested.
 */

/** Taps (doc ids) whose request is no longer on the owner's list. */
export function staleTaps(taps: { id: string; itemId: unknown }[], requestIds: unknown): string[] {
  const current = new Set(Array.isArray(requestIds) ? requestIds.filter((x): x is string => typeof x === "string") : []);
  return taps.filter((t) => typeof t.itemId !== "string" || !current.has(t.itemId)).map((t) => t.id);
}

/** "PHP.4.6-7" -> "PHP". Must match the verseBook check in firestore.rules. */
export function bookOf(verseRef: string): string {
  return verseRef.split(".")[0];
}

export type VerseIndex = { books: Record<string, number>; refs: Record<string, number> };

/** How many of my posts used each book and each exact reference. */
export function buildVerseIndex(verseRefs: unknown[]): VerseIndex {
  const out: VerseIndex = { books: {}, refs: {} };
  for (const ref of verseRefs) {
    if (typeof ref !== "string" || !ref) continue;
    const book = bookOf(ref);
    out.books[book] = (out.books[book] ?? 0) + 1;
    out.refs[ref] = (out.refs[ref] ?? 0) + 1;
  }
  return out;
}
