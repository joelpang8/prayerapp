import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import { follow } from "../src/lib/friends";
import { NO_FILTER, refsInBook, watchFilteredPosts, watchPostsOnDays, watchVerseIndex, type PrayerFilter, type VerseIndex } from "../src/lib/myPrayers";
import { watchMyPostsInMonth } from "../src/lib/monthRecap";
import { onThisDayIds } from "../src/lib/onThisDay";
import type { Post } from "../src/lib/posts";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore() as unknown as Firestore); });
}

// Alice's posts over a few years; Bob (her friend) has one too.
async function post(id: string, author: string, extra: Record<string, unknown> = {}) {
  const promptId = id.split("_")[0];
  const at = new Date(Date.UTC(+promptId.slice(0, 4), +promptId.slice(4, 6) - 1, +promptId.slice(6), 16));
  await seed((db) => setDoc(doc(db, "posts", id), {
    authorId: author, promptId, promptFiredAt: Timestamp.fromDate(at), createdAt: Timestamp.fromDate(at),
    notes: `notes ${id}`, photoPath: `postPhotos/${author}/p.jpg`, visibility: "friends", ...extra,
  }));
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
  await follow(dbAs(env, "alice"), "alice", "bob");
  await follow(dbAs(env, "bob"), "bob", "alice");
  await post("20241008_alice", "alice", { verseRef: "PHP.4.6-7", verseBook: "PHP", answeredAt: Timestamp.fromDate(new Date("2025-01-02")) });
  await post("20250228_alice", "alice", { verseRef: "PHP.4.13", verseBook: "PHP", visibility: "private", photoPath: "privatePhotos/alice/p.jpg" });
  await post("20240229_alice", "alice", { verseRef: "JHN.3.16", verseBook: "JHN", answeredAt: Timestamp.fromDate(new Date("2024-03-05")) });
  await post("20251008_alice", "alice");
  await post("20261001_alice", "alice", { verseRef: "PHP.4.6-7", verseBook: "PHP" });
  await post("20251008_bob", "bob", { verseRef: "PHP.4.6-7", verseBook: "PHP", answeredAt: Timestamp.now() });
});

async function page(f: PrayerFilter, max = 20) {
  let result: { posts: Post[]; hasMore: boolean } | null = null;
  let error: Error | null = null;
  const stop = watchFilteredPosts(dbAs(env, "alice"), "alice", f, max, (p) => { result = p; }, (e) => { error = e; });
  await until(() => result !== null || error !== null);
  stop();
  if (error) throw error;
  return { ids: result!.posts.map((p) => p.id), hasMore: result!.hasMore };
}

describe("Prayers tab filters (my posts only)", () => {
  test("answered: newest answer first, never a friend's", async () => {
    expect(await page({ ...NO_FILTER, show: "answered" })).toEqual({ ids: ["20241008_alice", "20240229_alice"], hasMore: false });
  });

  test("by book includes private posts; by exact verse narrows it", async () => {
    expect((await page({ ...NO_FILTER, book: "PHP" })).ids).toEqual(["20261001_alice", "20250228_alice", "20241008_alice"]);
    expect((await page({ ...NO_FILTER, book: "PHP", ref: "PHP.4.6-7" })).ids).toEqual(["20261001_alice", "20241008_alice"]);
    expect((await page({ show: "answered", book: "PHP", ref: null })).ids).toEqual(["20241008_alice"]);
  });

  test("pages: says when there are more, and a bigger page continues the list", async () => {
    expect(await page(NO_FILTER, 2)).toEqual({ ids: ["20261001_alice", "20251008_alice"], hasMore: true });
    expect(await page(NO_FILTER, 4)).toEqual({ ids: ["20261001_alice", "20251008_alice", "20250228_alice", "20241008_alice"], hasMore: true });
    expect((await page(NO_FILTER, 5)).hasMore).toBe(false);
  });
});

describe("on this day", () => {
  async function onDay(todayId: string) {
    let posts: Post[] | null = null;
    const stop = watchPostsOnDays(dbAs(env, "alice"), "alice", onThisDayIds(todayId, 2020), (p) => { posts = p; });
    await until(() => posts !== null);
    stop();
    return posts!.map((p) => p.id);
  }

  test("my posts from the same day in earlier years, never a friend's", async () => {
    expect(await onDay("20261008")).toEqual(["20251008_alice", "20241008_alice"]);
  });

  test("29 February shows on 28 February in a common year, alongside the 28th", async () => {
    expect(await onDay("20270228")).toEqual(["20250228_alice", "20240229_alice"]);
  });

  test("none today", async () => {
    expect(await onDay("20260704")).toEqual([]);
  });

  test("a friend can't run it on my posts", async () => {
    let error: Error | null = null;
    const stop = watchPostsOnDays(dbAs(env, "bob"), "alice", ["20251008"], () => {}, (e) => { error = e; });
    await until(() => error !== null);
    stop();
    expect((error as unknown as { code: string }).code).toBe("permission-denied");
  });
});

describe("verse picker", () => {
  test("reads my own index (empty before there is one), and lists a book's verses in order", async () => {
    let index: VerseIndex | null = null;
    const stop = watchVerseIndex(dbAs(env, "alice"), "alice", (i) => { index = i; });
    await until(() => index !== null);
    expect(index).toEqual({ books: {}, refs: {} });
    await seed((db) => setDoc(doc(db, "users", "alice", "private", "verseIndex"), {
      books: { PHP: 3, JHN: 1, OLD: 0 }, refs: { "PHP.4.13": 1, "PHP.4.6-7": 2, "PHP.1.6": 1, "JHN.3.16": 1 },
    }));
    await until(() => !!index && Object.keys(index.books).length === 2);
    stop();
    expect(index!.books).toEqual({ PHP: 3, JHN: 1 });
    expect(refsInBook(index!, "PHP")).toEqual([
      { id: "PHP.1.6", count: 1 }, { id: "PHP.4.6-7", count: 2 }, { id: "PHP.4.13", count: 1 },
    ]);
  });

  test("a friend can't read my index", async () => {
    let error: Error | null = null;
    const stop = watchVerseIndex(dbAs(env, "bob"), "alice", () => {}, (e) => { error = e; });
    await until(() => error !== null);
    stop();
  });
});

describe("one app month (calendar and recap)", () => {
  async function month(viewer: string, ym: { year: number; month: number }) {
    let posts: Post[] | null = null;
    let error: Error | null = null;
    const stop = watchMyPostsInMonth(dbAs(env, viewer), "alice", ym, (p) => { posts = p; }, (e) => { error = e; });
    await until(() => posts !== null || error !== null);
    stop();
    return { ids: posts ? (posts as Post[]).map((p) => p.id) : null, error };
  }

  test("my posts in that month by prompt day, private ones included, never a friend's", async () => {
    await post("20250201_alice", "alice", { visibility: "private", photoPath: "privatePhotos/alice/p.jpg" });
    // Posted late, early on 1 March by the clock, but for 28 February's prompt.
    await post("20250228_alice", "alice");
    await post("20250301_alice", "alice");
    await post("20250215_bob", "bob");
    expect((await month("alice", { year: 2025, month: 2 })).ids).toEqual(["20250228_alice", "20250201_alice"]);
    expect((await month("alice", { year: 2024, month: 2 })).ids).toEqual(["20240229_alice"]);
  });

  test("a friend can't run it on my posts", async () => {
    expect((await month("bob", { year: 2025, month: 10 })).error).not.toBeNull();
  });
});
