import { plainText, type Passage } from "./scripture/text";

/**
 * What "Share" sends: the verse text and its reference, nothing else (no
 * one's prayer, name or post). The iPhone's share sheet also offers Copy.
 *   Be still, and know that I am God…
 *   — Psalm 46:10 (KJV)
 */
export function verseShareText(passage: Pick<Passage, "reference" | "translation" | "verses">): string {
  const numbered = passage.verses.length > 1;
  const text = passage.verses
    .map((v) => `${numbered ? `${v.verse} ` : ""}${plainText(v.segments).trim()}`)
    .join(" ");
  return `${text}\n— ${passage.reference} (${passage.translation})`;
}
