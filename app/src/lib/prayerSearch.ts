import { formatReference, parseRefId } from "./scripture/reference";
import type { Post } from "./posts";

/**
 * "Search my prayers" on the Prayers tab: finds my own posts by words in
 * the notes, the answered note, the place, or the verse (in English or
 * Spanish book names). Runs on the phone over my own posts only.
 */

/** How many of my most recent posts are searched (plenty of years). */
export const SEARCH_LIMIT = 1000;
/** Searching starts from this many characters. */
export const MIN_SEARCH = 2;

/** Lowercase, without accents: "Oración" matches "oracion". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

function verseText(ref: string | null): string {
  if (!ref) return "";
  try {
    const r = parseRefId(ref);
    return `${formatReference(r, "en")} ${formatReference(r, "es")}`;
  } catch {
    return "";
  }
}

/** Every word of the search appears somewhere in the post. */
export function matchesSearch(post: Pick<Post, "notes" | "answerNote" | "place" | "verseRef">, search: string): boolean {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const hay = normalize([post.notes, post.answerNote ?? "", post.place ?? "", verseText(post.verseRef)].join(" "));
  return words.every((w) => hay.includes(w));
}
