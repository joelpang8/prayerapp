import { useEffect, useState } from "react";
import { db } from "../firebase";
import { getProfile, type Profile } from "../lib/profile";

// Public profiles (username + display name only), cached for the app session.
const cache = new Map<string, Promise<Profile | null>>();

export function useProfiles(uids: Iterable<string>): Map<string, Profile> {
  const key = [...uids].sort().join(",");
  const [profiles, setProfiles] = useState(new Map<string, Profile>());
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    Promise.all(
      list.map((uid) => {
        if (!cache.has(uid)) cache.set(uid, getProfile(db, uid).catch(() => (cache.delete(uid), null)));
        return cache.get(uid)!;
      }),
    ).then((results) => {
      if (!live) return;
      setProfiles(new Map(results.filter((p): p is Profile => !!p).map((p) => [p.uid, p])));
    });
    return () => { live = false; };
  }, [key]);
  return profiles;
}
