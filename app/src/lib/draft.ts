import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A half-written prayer: the words only (not the photo), for the day's
 * prompt, kept on this phone if the app closes while writing. My own words,
 * so it may go to disk; it's cleared when I post or discard it, replaced by
 * the next prompt's, and removed with the account (key ends with my uid).
 */
export type Draft = { promptId: string; notes: string };

export const draftKey = (uid: string) => `draft.${uid}`;

export function parseDraft(raw: string | null, promptId: string): string | null {
  try {
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : null;
    return d && d.promptId === promptId && typeof d.notes === "string" && d.notes.trim() ? d.notes : null;
  } catch {
    return null;
  }
}

export async function loadDraft(uid: string, promptId: string): Promise<string | null> {
  try {
    return parseDraft(await AsyncStorage.getItem(draftKey(uid)), promptId);
  } catch {
    return null;
  }
}

export function saveDraft(uid: string, promptId: string, notes: string): Promise<void> {
  const write = notes.trim()
    ? AsyncStorage.setItem(draftKey(uid), JSON.stringify({ promptId, notes } satisfies Draft))
    : AsyncStorage.removeItem(draftKey(uid));
  return write.catch(() => {});
}

export function clearDraft(uid: string): Promise<void> {
  return AsyncStorage.removeItem(draftKey(uid)).catch(() => {});
}
