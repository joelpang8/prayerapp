import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { tn } from "../i18n";
import type { YearMonth } from "./calendar";
import { appDayId } from "./onThisDay";
import { postFromSnapshot, type Post } from "./posts";
import { BOOKS } from "./scripture/books";

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

/** Prompt ids in the app year: "20260101" <= id < "20270101". */
export function yearIdRange(year: number): { from: string; to: string } {
  return { from: `${year}0101`, to: `${year + 1}0101` };
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

/**
 * My own posts in an app year, live, for "Your year in prayer". Same query
 * shape (and index) as the month's, over a longer range.
 */
export function watchMyPostsInYear(
  db: Firestore,
  uid: string,
  year: number,
  onPosts: (posts: Post[]) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  const { from, to } = yearIdRange(year);
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

export type YearRecap = {
  /** Prayers posted in the year (late ones count the same). */
  posted: number;
  answered: number;
  /** Months with at least one prayer, January first. Months without any aren't listed. */
  months: { month: number; count: number }[];
  /** How many different verses I prayed with. */
  verses: number;
  /** Books of those verses, in Bible order, with how many prayers each. */
  books: { book: string; count: number }[];
};

/**
 * "Your year in prayer": counts only, from my own posts, like the month's.
 * No streaks, goals, comparisons or "missed" months.
 */
export function buildYearRecap(me: string, posts: readonly Pick<Post, "authorId" | "promptId" | "answeredAt" | "verseRef">[]): YearRecap {
  const mine = posts.filter((p) => p.authorId === me);
  const perMonth = new Map<number, number>();
  const perBook = new Map<string, number>();
  const verses = new Set<string>();
  for (const p of mine) {
    const m = Number(p.promptId.slice(4, 6));
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
    if (p.verseRef) {
      verses.add(p.verseRef);
      const book = p.verseRef.split(".")[0];
      perBook.set(book, (perBook.get(book) ?? 0) + 1);
    }
  }
  return {
    posted: mine.length,
    answered: mine.filter((p) => p.answeredAt).length,
    months: [...perMonth].sort((a, b) => a[0] - b[0]).map(([month, count]) => ({ month, count })),
    verses: verses.size,
    books: BOOKS.filter((b) => perBook.has(b.id)).map((b) => ({ book: b.id, count: perBook.get(b.id)! })),
  };
}

/** "1 prayer", "12 prayers". */
export const prayersText = (n: number) => tn("prayers.count", n);

/**
 * The calendar's marks: for each app day with a prayer, whether any prayer
 * that day was answered, and the photo of the first one in `posts` (newest
 * first) for its thumbnail.
 */
export function markedDays(posts: readonly Pick<Post, "promptId" | "answeredAt" | "photoPath">[]): Map<string, { answered: boolean; photoPath: string | null }> {
  const m = new Map<string, { answered: boolean; photoPath: string | null }>();
  for (const p of posts) {
    const key = dayKeyOfPromptId(p.promptId);
    const prev = m.get(key);
    m.set(key, { answered: (prev?.answered ?? false) || !!p.answeredAt, photoPath: prev?.photoPath ?? p.photoPath ?? null });
  }
  return m;
}
