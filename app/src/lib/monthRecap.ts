import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { YearMonth } from "./calendar";
import { appDayId } from "./onThisDay";
import { postFromSnapshot, type Post } from "./posts";

/**
 * "Your month in prayer" and the Prayers calendar use the app's months: a
 * post belongs to the month of its prompt id (the prompt's date in
 * America/New_York, see onThisDay.ts), never the phone's date, so travel or
 * clock changes don't move a prayer into another month. A late post counts
 * in its prompt's month, like any other.
 */

/** The app's month for an instant. */
export function appMonthOf(at: Date): YearMonth {
  const id = appDayId(at);
  return { year: Number(id.slice(0, 4)), month: Number(id.slice(4, 6)) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Prompt ids in the month: from <= id < to ("20261001" to "20261101"). */
export function monthIdRange({ year, month }: YearMonth): { from: string; to: string } {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { from: `${year}${pad(month)}01`, to: `${next.year}${pad(next.month)}01` };
}

/** "20261008" -> "2026-10-08", the calendar's day key. */
export const dayKeyOfPromptId = (id: string) => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;

/**
 * My own posts in an app month, newest day first, live. Only my posts
 * (private ones included); the rules refuse this query to anyone else.
 * Index: posts(authorId, promptId desc).
 */
export function watchMyPostsInMonth(
  db: Firestore,
  uid: string,
  ym: YearMonth,
  onPosts: (posts: Post[]) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  const { from, to } = monthIdRange(ym);
  return onSnapshot(
    query(collection(db, "posts"), where("authorId", "==", uid), where("promptId", ">=", from), where("promptId", "<", to), orderBy("promptId", "desc")),
    (snap) => onPosts(snap.docs.map(postFromSnapshot).filter((p): p is Post => !!p)),
    onError,
  );
}

export type MonthRecap = {
  /** Prayers posted (late ones count the same; on-time vs late is never part of it). */
  posted: number;
  /** Of those, how many are now marked answered. */
  answered: number;
  /** The day's verse on each day I posted, once each, in date order. Nothing for other days. */
  verses: string[];
};

/** Counts only, from my own posts. Anyone else's post is ignored. */
export function buildRecap(me: string, posts: readonly Pick<Post, "authorId" | "promptId" | "answeredAt" | "verseRef">[]): MonthRecap {
  const mine = posts.filter((p) => p.authorId === me).slice().sort((a, b) => a.promptId.localeCompare(b.promptId));
  const verses: string[] = [];
  for (const p of mine) if (p.verseRef && !verses.includes(p.verseRef)) verses.push(p.verseRef);
  return { posted: mine.length, answered: mine.filter((p) => p.answeredAt).length, verses };
}

/** "1 prayer", "12 prayers". */
export const prayersText = (n: number) => (n === 1 ? "1 prayer" : `${n} prayers`);
