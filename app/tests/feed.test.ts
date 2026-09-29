import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { follow, removeFriend } from "../src/lib/friends";
import { FeedStore } from "../src/lib/feed";
import { FriendScope } from "../src/lib/friendScope";
import type { Post } from "../src/lib/posts";
import { dbAs, seedPost, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const USERS = ["bob", "alice", "carol", "dave", "erin", "frank", "gina"];

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of USERS) await seedUser(env, u);
  const base = Date.now() - 60 * 60_000;
  // Each author's post is a minute apart so ordering is checkable.
  for (const [i, u] of USERS.entries()) await seedPost(env, `20260929_${u}`, u, new Date(base + i * 60_000));
});

function startFeed(uid: string, chunkSize?: number) {
  const scope = new FriendScope(dbAs(env, uid), uid);
  const errors: Error[] = [];
  const feed = new FeedStore(dbAs(env, uid), scope, { chunkSize, onError: (e) => errors.push(e) });
  let posts: Post[] = [];
  feed.start();
  feed.subscribe((p) => { posts = p; });
  scope.start();
  return {
    scope,
    feed,
    errors,
    authors: () => posts.map((p) => p.authorId),
    stop: () => { feed.stop(); scope.stop(); },
  };
}

describe("friend feed", () => {
  test("shows friends' posts only, newest first; not pending requests or strangers", async () => {
    await befriend("bob", "alice");
    await befriend("bob", "carol");
    await follow(dbAs(env, "dave"), "dave", "bob"); // pending request to bob
    const f = startFeed("bob");
    try {
      await until(() => f.authors().length === 2);
      expect(f.authors()).toEqual(["carol", "alice"]);
    } finally {
      f.stop();
    }
  });

  test("removed friend's posts disappear immediately; others stay", async () => {
    await befriend("bob", "alice");
    await befriend("bob", "carol");
    const f = startFeed("bob");
    try {
      await until(() => f.authors().length === 2);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => !f.authors().includes("alice"));
      expect(f.authors()).toEqual(["carol"]);
    } finally {
      f.stop();
    }
  });

  test("a new friend's posts appear; a friend's new post appears live", async () => {
    await befriend("bob", "alice");
    const f = startFeed("bob");
    try {
      await until(() => f.authors().length === 1);
      await befriend("bob", "carol");
      await until(() => f.authors().includes("carol"));
      await seedPost(env, "20260930_alice", "alice", new Date());
      await until(() => f.authors()[0] === "alice" && f.authors().length === 3);
    } finally {
      f.stop();
    }
  });

  test("works across several query chunks (more friends than one chunk holds)", async () => {
    for (const u of USERS.slice(1)) await befriend("bob", u);
    const f = startFeed("bob", 2);
    try {
      await until(() => f.authors().length === 6);
      expect(f.authors()).toEqual(["gina", "frank", "erin", "dave", "carol", "alice"]);
      await removeFriend(dbAs(env, "bob"), "bob", "dave");
      await until(() => !f.authors().includes("dave"));
      expect(f.authors()).toEqual(["gina", "frank", "erin", "carol", "alice"]);
    } finally {
      f.stop();
    }
  });

  test("sign-out (scope.stop) empties the feed", async () => {
    await befriend("bob", "alice");
    const f = startFeed("bob");
    await until(() => f.authors().length === 1);
    f.scope.stop();
    expect(f.feed.posts).toEqual([]);
    f.feed.stop();
  });
});
