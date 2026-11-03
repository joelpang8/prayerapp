import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * "What's new": a short card on Today the first time someone opens an
 * update, listing what changed. Which notes were seen is kept on this phone
 * only (a display preference, nobody's content). Bump WHATS_NEW.id and
 * rewrite the items (en and es, in i18n/strings/common.ts) for each update
 * worth announcing.
 */
export const WHATS_NEW = {
  /** The day these notes were written; also the cut-off for "new account". */
  id: "2026-11-02",
  items: [
    "whatsNew.item.circles",
    "whatsNew.item.answeredRequests",
    "whatsNew.item.reorder",
    "whatsNew.item.hometown",
    "whatsNew.item.username",
    "whatsNew.item.versePicture",
    "whatsNew.item.prayNow",
    "whatsNew.item.bibles",
    "whatsNew.item.livePosts",
  ],
} as const;

const SEEN_KEY = "whatsNew.seen";

/**
 * Show the card when these notes haven't been seen on this phone, unless the
 * account is newer than the notes (it never knew the app without them).
 */
export function shouldShowWhatsNew(seenId: string | null, accountCreated: Date | null): boolean {
  if (seenId === WHATS_NEW.id) return false;
  if (accountCreated && accountCreated.getTime() >= new Date(`${WHATS_NEW.id}T00:00:00Z`).getTime()) return false;
  return true;
}

export async function loadSeenWhatsNew(): Promise<string | null> {
  return AsyncStorage.getItem(SEEN_KEY).catch(() => null);
}

export function markWhatsNewSeen(): Promise<void> {
  return AsyncStorage.setItem(SEEN_KEY, WHATS_NEW.id).catch(() => {});
}
