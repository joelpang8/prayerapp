import { doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";

/**
 * Opt-in notifications about my own things (firebase/functions/src/
 * activityNotify.ts): a friend praying for my requests, reacting to my
 * prayer, commenting on it. All off until turned on in Settings. Stored at
 * users/{me}/private/notify (owner-only) with a secret random topic that
 * only this account's phones listen on; no push tokens are stored.
 */
export type NotifyKind = "taps" | "reactions" | "comments" | "requests";
export type NotifyPrefs = {
  topic: string; taps: boolean; reactions: boolean; comments: boolean; lang: "en" | "es";
  /** New friend requests. */
  requests: boolean;
  /** Prayer circles I want told about: new requests, answered ones (off per circle until turned on). */
  circles: string[];
};

/** Most circles one person can turn notifications on for (firestore.rules). */
export const MAX_NOTIFY_CIRCLES = 50;

export const NOTIFY_KINDS: readonly NotifyKind[] = ["taps", "reactions", "comments", "requests"];
export const TOPIC_PATTERN = /^n_[A-Za-z0-9]{32}$/; // must match firestore.rules

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new secret topic from 32 random bytes (pass the phone's secure random). */
export function newTopic(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(32);
  return "n_" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const anyOn = (p: NotifyPrefs | null): boolean => !!p && (p.taps || p.reactions || p.comments || p.requests || p.circles.length > 0);

export function parseNotifyPrefs(d: Record<string, unknown> | undefined): NotifyPrefs | null {
  if (!d || typeof d.topic !== "string" || !TOPIC_PATTERN.test(d.topic)) return null;
  return {
    topic: d.topic, taps: d.taps === true, reactions: d.reactions === true, comments: d.comments === true, requests: d.requests === true, lang: d.lang === "es" ? "es" : "en",
    circles: Array.isArray(d.circles) ? d.circles.filter((c): c is string => typeof c === "string").slice(0, MAX_NOTIFY_CIRCLES) : [],
  };
}

/** Turn one kind on or off, creating the settings (and topic) the first time. */
export function changeNotifyPrefs(current: NotifyPrefs | null, kind: NotifyKind, on: boolean, lang: "en" | "es", topic: () => string): NotifyPrefs {
  return { ...base(current, lang, topic), [kind]: on, lang };
}

const base = (current: NotifyPrefs | null, lang: "en" | "es", topic: () => string): NotifyPrefs =>
  current ?? { topic: topic(), taps: false, reactions: false, comments: false, requests: false, lang, circles: [] };

/**
 * Turn one circle's notifications on or off. Circles I'm no longer in are
 * dropped along the way (`stillIn`), so the list stays within the limit.
 */
export function changeCircleNotify(
  current: NotifyPrefs | null, circleId: string, on: boolean, lang: "en" | "es", topic: () => string, stillIn: (id: string) => boolean,
): NotifyPrefs {
  const b = base(current, lang, topic);
  const kept = b.circles.filter((c) => c !== circleId && stillIn(c));
  return { ...b, lang, circles: on ? [...kept, circleId].slice(-MAX_NOTIFY_CIRCLES) : kept };
}

const ref = (db: Firestore, uid: string) => doc(db, "users", uid, "private", "notify");

export function watchNotifyPrefs(db: Firestore, uid: string, onPrefs: (p: NotifyPrefs | null) => void): Unsubscribe {
  return onSnapshot(ref(db, uid), (snap) => onPrefs(parseNotifyPrefs(snap.data())), () => onPrefs(null));
}

export function saveNotifyPrefs(db: Firestore, uid: string, prefs: NotifyPrefs): Promise<void> {
  return setDoc(ref(db, uid), prefs);
}
