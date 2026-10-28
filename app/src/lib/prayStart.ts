import { deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import { ON_TIME_WINDOW_MS } from "./posts";

/**
 * "Pray now" keeps you on time. Pressing Pray now while the prompt is still
 * on time records the server's time at users/{me}/starts/{promptId}
 * (firestore.rules allows it only in the first 7 minutes). A post made
 * within 15 minutes of that carries it and counts as on time, so there's
 * no need to rush. Cancelling deletes it; pressing Pray now again after the
 * window then gives a late post, as before.
 */
export const START_GRACE_MS = 15 * 60_000; // must match firestore.rules

/** The exact server timestamp (the rules compare it exactly). */
export type StartStamp = { seconds: number; nanoseconds: number };

export const stampMs = (s: StartStamp) => s.seconds * 1000 + Math.floor(s.nanoseconds / 1e6);

const startRef = (db: Firestore, uid: string, promptId: string) => doc(db, "users", uid, "starts", promptId);

/** Can Pray now still record a start for this prompt? (The server decides; this avoids a refused write.) */
export function canStart(firedAtMs: number, nowMs: number): boolean {
  return nowMs >= firedAtMs && nowMs <= firedAtMs + ON_TIME_WINDOW_MS - 5_000;
}

/** Is this start still usable for posting now? A little margin for the trip to the server. */
export function startStillValid(start: StartStamp, nowMs: number, marginMs = 20_000): boolean {
  return nowMs <= stampMs(start) + START_GRACE_MS - marginMs;
}

/** Posted within 15 minutes of an on-time start: counts as on time. */
export function onTimeByStart(firedAtMs: number, startedAtMs: number, createdAtMs: number): boolean {
  return startedAtMs - firedAtMs <= ON_TIME_WINDOW_MS && createdAtMs - startedAtMs <= START_GRACE_MS;
}

/** My start for this prompt, from the server; null if none. */
export async function readStart(db: Firestore, uid: string, promptId: string): Promise<StartStamp | null> {
  const snap = await getDocFromServer(startRef(db, uid, promptId));
  const t = snap.data()?.startedAt;
  return t instanceof Timestamp ? { seconds: t.seconds, nanoseconds: t.nanoseconds } : null;
}

/** Pray now: record the start (or keep an existing one) and return it; null if it's too late or offline. */
export async function beginPraying(db: Firestore, uid: string, promptId: string): Promise<StartStamp | null> {
  try {
    const existing = await readStart(db, uid, promptId);
    if (existing) return existing;
    await setDoc(startRef(db, uid, promptId), { startedAt: serverTimestamp() });
    return await readStart(db, uid, promptId);
  } catch {
    return null; // too late (refused) or offline: posting works as before
  }
}

/** Cancel: the 15 minutes are given up. */
export function cancelPraying(db: Firestore, uid: string, promptId: string): Promise<void> {
  return deleteDoc(startRef(db, uid, promptId)).catch(() => {});
}
