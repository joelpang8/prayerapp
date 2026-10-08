import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Firestore,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { postFromSnapshot, type Post } from "./posts";

/**
 * The Prayers tab's filters and "On this day". Every query here is my own
 * posts only (authorId == me), private ones included; the rules refuse
 * anyone else these queries. It never includes a friend's content.
 *
 * Indexes (firebase/firestore.indexes.json): posts by author with
 *  verseBook or verseRef, then createdAt (all) or answeredAt (answered),
 *  and by author and answeredAt.
 */
export type PrayerFilter = {
  show: "all" | "answered";
  /** A book code like "PHP", or null for any. */
  book: string | null;
  /** An exact reference id like "PHP.4.6-7" within the book, or null. */
  ref: string | null;
};

export const NO_FILTER: PrayerFilter = { show: "all", book: null, ref: null };
export const PAGE_SIZE = 20;

export const isFiltered = (f: PrayerFilter) => f.show !== "all" || !!f.book || !!f.ref;

export function filterConstraints(uid: string, f: PrayerFilter): QueryConstraint[] {
  const out: QueryConstraint[] = [where("authorId", "==", uid)];
  if (f.ref) out.push(where("verseRef", "==", f.ref));
  else if (f.book) out.push(where("verseBook", "==", f.book));
  if (f.show === "answered") out.push(where("answeredAt", ">=", Timestamp.fromMillis(0)), orderBy("answeredAt", "desc"));
  else out.push(orderBy("createdAt", "desc"));
  return out;
}

/**
 * The first `max` matching posts, newest first (answered: most recently
 * answered first), live. "Load more" asks again with a bigger max; one
 * extra is fetched to know whether there are more.
 */
export function watchFilteredPosts(
  db: Firestore,
  uid: string,
  f: PrayerFilter,
  max: number,
  onPage: (page: { posts: Post[]; hasMore: boolean }) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "posts"), ...filterConstraints(uid, f), limit(max + 1)),
    (snap) => {
      const posts = snap.docs.map(postFromSnapshot).filter((p): p is Post => !!p);
      onPage({ posts: posts.slice(0, max), hasMore: posts.length > max });
    },
    onError,
  );
}

/** My posts with these prompt ids (see onThisDay.ts), newest first, live. */
export function watchPostsOnDays(
  db: Firestore,
  uid: string,
  promptIds: readonly string[],
  onPosts: (posts: Post[]) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  if (promptIds.length === 0) {
    onPosts([]);
    return () => {};
  }
  // "in" takes at most 30 values.
  const chunks: string[][] = [];
  for (let i = 0; i < promptIds.length; i += 30) chunks.push(promptIds.slice(i, i + 30));
  const results = new Map<number, Post[]>();
  const stops = chunks.map((ids, i) =>
    onSnapshot(
      query(collection(db, "posts"), where("authorId", "==", uid), where("promptId", "in", ids)),
      (snap) => {
        results.set(i, snap.docs.map(postFromSnapshot).filter((p): p is Post => !!p));
        if (results.size === chunks.length) {
          onPosts([...results.values()].flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        }
      },
      onError,
    ),
  );
  return () => stops.forEach((s) => s());
}

/** The books and exact references of my own posts, with counts (kept by a Cloud Function). */
export type VerseIndex = { books: Record<string, number>; refs: Record<string, number> };
export const EMPTY_VERSE_INDEX: VerseIndex = { books: {}, refs: {} };

export function watchVerseIndex(
  db: Firestore,
  uid: string,
  onIndex: (index: VerseIndex) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "private", "verseIndex"),
    (snap) => {
      const d = snap.data();
      const counts = (m: unknown): Record<string, number> =>
        Object.fromEntries(Object.entries(m && typeof m === "object" ? m : {}).filter(([, n]) => typeof n === "number" && n > 0));
      onIndex({ books: counts(d?.books), refs: counts(d?.refs) });
    },
    onError,
  );
}

/** The exact references within a book, as {id, count}, in Bible order where possible. */
export function refsInBook(index: VerseIndex, book: string): { id: string; count: number }[] {
  return Object.entries(index.refs)
    .filter(([id]) => id.split(".")[0] === book)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => {
      const [, ac = 0, av = 0] = a.id.split(/[.-]/).map(Number);
      const [, bc = 0, bv = 0] = b.id.split(/[.-]/).map(Number);
      return ac - bc || av - bv || a.id.localeCompare(b.id);
    });
}
