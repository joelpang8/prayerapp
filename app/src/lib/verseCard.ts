import type { Passage, Segment } from "./scripture/text";

/** A card shows at most this many verses (like a verse's preview); longer passages end with "…". */
export const CARD_VERSES = 4;

/** The verses on the card, as one run of text (numbers shown when there's more than one verse). */
export function cardVerses(passage: Pick<Passage, "verses">): { segments: Segment[]; text: string; more: boolean } {
  const shown = passage.verses.slice(0, CARD_VERSES);
  const numbered = passage.verses.length > 1;
  const segments: Segment[] = [];
  shown.forEach((v, i) => {
    const lead = `${i > 0 ? " " : ""}${numbered ? `${v.verse} ` : ""}`;
    if (lead) segments.push({ text: lead, supplied: false });
    segments.push(...v.segments);
  });
  return { segments, text: segments.map((s) => s.text).join(""), more: passage.verses.length > CARD_VERSES };
}

/** Smaller type for longer text, so the card never overflows. */
export function cardFontSize(text: string): number {
  const n = text.length;
  if (n <= 110) return 26;
  if (n <= 220) return 22;
  if (n <= 360) return 19;
  if (n <= 520) return 17;
  return 15;
}
