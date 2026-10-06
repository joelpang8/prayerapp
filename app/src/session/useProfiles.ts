import { useEffect, useState } from "react";
import { db } from "../firebase";
import { getProfile, type Profile } from "../lib/profile";

// Public profiles (username, display name, photo path). Cached briefly, so
// a friend's new name or photo shows up without restarting the app.
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; profile: Promise<Profile | null> }>();

export function loadProfile(uid: string): Promise<Profile | null> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.profile;
  const profile = getProfile(db, uid).catch(() => (cache.delete(uid), null));
  cache.set(uid, { at: Date.now(), profile });
  return profile;
}

export function useProfiles(uids: Iterable<string>): Map<string, Profile> {
  const key = [...uids].sort().join(",");
  const [profiles, setProfiles] = useState(new Map<string, Profile>());
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    Promise.all(
      list.map(loadProfile),
    ).then((results) => {
      if (!live) return;
      setProfiles(new Map(results.filter((p): p is Profile => !!p).map((p) => [p.uid, p])));
    });
    return () => { live = false; };
  }, [key]);
  return profiles;
}
