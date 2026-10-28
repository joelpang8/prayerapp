/** Below this many friends the list is short enough to scan, so no search box. */
export const FRIEND_FILTER_MIN = 6;

type Named = { displayName: string; username: string };

/** Lowercase without accents, so "jose" finds "José". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * My friends whose name or username contains the search, in the list's order.
 * An empty search keeps everyone. A friend whose profile hasn't loaded yet is
 * kept only while the search is empty. Runs on the phone over what's already
 * loaded; nothing is sent anywhere.
 */
export function filterFriends(uids: readonly string[], profiles: ReadonlyMap<string, Named>, query: string): string[] {
  const q = fold(query.replace(/^@/, ""));
  if (!q) return [...uids];
  return uids.filter((uid) => {
    const p = profiles.get(uid);
    return !!p && (fold(p.displayName).includes(q) || fold(p.username).includes(q));
  });
}
