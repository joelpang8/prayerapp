/**
 * Prayer requests on a profile: one per line, each with a hidden id that
 * friends' "I'll pray for this" taps point at. A line keeps its id while its
 * text stays the same; a reworded line gets a new id, so its count starts
 * again (otherwise "3 praying" could carry over to a different request).
 */

/** Must match firestore.rules (validRequests). */
export const MAX_REQUESTS = 10;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9]{8,32}$/;

export type PrayerRequest = {
  /** null for requests saved before ids existed: shown, but can't be tapped until the owner saves again. */
  id: string | null;
  text: string;
};

/** The requests, one per non-empty line, trimmed. */
export function splitRequests(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** The stored form: the lines joined with "\n". */
export function joinRequests(lines: readonly string[]): string {
  return lines.join("\n");
}

/** The stored text and ids, paired up. Ids that don't line up (older saves) are dropped. */
export function requestItems(text: string, ids: readonly string[]): PrayerRequest[] {
  const lines = text.split("\n");
  const aligned = ids.length === lines.length && ids.every((id) => REQUEST_ID_PATTERN.test(id));
  return lines
    .map((line, i) => ({ id: aligned ? ids[i] : null, text: line.trim() }))
    .filter((r) => r.text);
}

/**
 * Ids for the new lines: a line whose exact text was there before keeps that
 * id (each old id used once); any other line gets a new one.
 */
export function assignRequestIds(before: readonly PrayerRequest[], lines: readonly string[], newId: () => string): string[] {
  const unused = new Map<string, string[]>();
  for (const r of before) {
    if (!r.id) continue;
    unused.set(r.text, [...(unused.get(r.text) ?? []), r.id]);
  }
  return lines.map((line) => unused.get(line)?.shift() ?? newId());
}
