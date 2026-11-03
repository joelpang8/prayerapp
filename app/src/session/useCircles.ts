import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { db } from "../firebase";
import { watchCircle, watchCircleInvites, watchCircleRequests, watchMyCircles, watchNewestRequest, type Circle, type CircleRequest } from "../lib/circles";
import { useReadySession } from "./SessionProvider";

/** Circles I'm in and circles I'm invited to, live. */
export function useMyCircles(): { circles: Circle[]; invites: Circle[]; loaded: boolean } {
  const { profile } = useReadySession();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [invites, setInvites] = useState<Circle[]>([]);
  useEffect(() => {
    const a = watchMyCircles(db, profile.uid, setCircles, (e) => { console.warn("circles failed", e); setCircles([]); });
    const b = watchCircleInvites(db, profile.uid, setInvites, (e) => console.warn("circle invites failed", e));
    return () => { a(); b(); };
  }, [profile.uid]);
  return { circles: circles ?? [], invites, loaded: circles !== null };
}

/** One circle and its requests, live; `gone` once it's deleted or I'm no longer in it. */
export function useCircle(id: string): { circle: Circle | null; requests: CircleRequest[]; loaded: boolean; gone: boolean } {
  const [circle, setCircle] = useState<Circle | null | undefined>(undefined);
  const [requests, setRequests] = useState<{ id: string; list: CircleRequest[] } | null>(null);
  useEffect(() => watchCircle(db, id, setCircle, () => setCircle(null)), [id]);
  const member = !!circle;
  useEffect(() => {
    if (!member) return;
    return watchCircleRequests(db, id, (list) => setRequests({ id, list }), (e) => {
      console.warn("circle requests failed", e);
      setRequests({ id, list: [] });
    });
  }, [id, member]);
  // Nothing from a circle I'm not (or no longer) in.
  const list = member && requests?.id === id ? requests.list : [];
  return { circle: circle ?? null, requests: list, loaded: circle !== undefined, gone: circle === null };
}

// When I last opened each circle, kept on this phone only (no one's content),
// for the "New" dot. Removed with the account's other keys.
const seenKey = (uid: string) => `circleSeen.${uid}`;

async function readSeen(uid: string): Promise<Record<string, number>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(seenKey(uid))) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function useMarkCircleSeen(circleId: string): void {
  const { profile } = useReadySession();
  useEffect(() => {
    void readSeen(profile.uid).then((seen) =>
      AsyncStorage.setItem(seenKey(profile.uid), JSON.stringify({ ...seen, [circleId]: Date.now() })).catch(() => {}));
  }, [profile.uid, circleId]);
}

/** True when someone else added a request since I last opened the circle. */
export function useCircleHasNew(circleId: string): boolean {
  const { profile } = useReadySession();
  const [newest, setNewest] = useState<CircleRequest | null>(null);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  useEffect(() => watchNewestRequest(db, circleId, setNewest), [circleId]);
  const refresh = useCallback(() => { void readSeen(profile.uid).then((s) => setSeenAt(s[circleId] ?? 0)); }, [profile.uid, circleId]);
  useEffect(refresh, [refresh, newest]);
  if (!newest || seenAt === null || newest.authorId === profile.uid || !newest.createdAt) return false;
  return newest.createdAt.getTime() > seenAt;
}
