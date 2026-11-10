import { MAX_NOTES } from "./posts";

/** The line a list entry adds to the prayer: just the name (its private note stays private). */
export const lineFor = (name: string) => `🙏 ${name.trim()}`;

/** Adds a line to the notes on a new line, if it isn't there yet and there's room. */
export function withLine(notes: string, line: string, max = MAX_NOTES): string {
  if (notes.split("\n").some((l) => l.trim() === line)) return notes;
  const next = notes.trim() ? `${notes.replace(/\s+$/, "")}\n${line}` : line;
  return next.length > max ? notes : next;
}
