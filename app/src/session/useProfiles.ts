import { useEffect, useState } from "react";
import { db } from "../firebase";
import { getProfile, type Profile } from "../lib/profile";

// Public profiles (username, display name, photo path), kept in memory for
// this session. A screen shows what's already known straight away and asks
// again in the background once it's a few minutes old, so a friend's new
// name or photo still shows up without restarting the app.
const TTL_MS = 5 * 60_000;
type Entry = { at: number; profile: Promise<Profile | null>; value?: Profile | null };
const cache = new Map<string, Entry>();

export function loadProfile(uid: string): Promise<Profile | null> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.profile;
  const entry: Entry = { at: Date.now(), profile: Promise.resolve(null), value: hit?.value };
  entry.profile = getProfile(db, uid).then(
    (p) => { entry.value = p; return p; },
    () => { if (cache.get(uid) === entry) cache.delete(uid); return hit?.value ?? null; },
  );
  cache.set(uid, entry);
  return entry.profile;
}

/** Start loading these profiles now (e.g. my friends, as soon as the app opens). */
export function prefetchProfiles(uids: Iterable<string>): void {
  for (const uid of uids) void loadProfile(uid);
}

/** What's already known about these people, right now. */
function known(list: readonly string[]): Map<string, Profile> {
  const out = new Map<string, Profile>();
  for (const uid of list) {
    const v = cache.get(uid)?.value;
    if (v) out.set(uid, v);
  }
  return out;
}

/**
 * Profiles for these people: whatever is already known at once, then each
 * one as it arrives (never waiting for the slowest).
 */
export function useProfiles(uids: Iterable<string>): Map<string, Profile> {
  const key = [...uids].sort().join(",");
  const [state, setState] = useState(() => ({ key, profiles: known(key ? key.split(",") : []) }));
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    for (const uid of list) {
      void loadProfile(uid).then((p) => {
        if (!live || !p) return;
        setState((s) => {
          const base = s.key === key ? s.profiles : known(list);
          if (s.key === key && base.get(uid) === p) return s;
          const next = new Map(base);
          next.set(uid, p);
          return { key, profiles: next };
        });
      });
    }
    return () => { live = false; };
  }, [key]);
  return state.key === key ? state.profiles : known(key ? key.split(",") : []);
}
