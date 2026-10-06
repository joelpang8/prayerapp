import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
const { ActivityStore } = await import("../src/lib/activity");
const { addComment } = await import("../src/lib/comments");
const { FeedStore } = await import("../src/lib/feed");
const { follow, removeFriend } = await import("../src/lib/friends");
const { FriendScope } = await import("../src/lib/friendScope");
const { react } = await import("../src/lib/reactions");
const { dbAs, seedPost, seedUser, setupEnv, until } = await import("./env");
import type { Activity } from "../src/lib/activity";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
  await follow(dbAs(env, "alice"), "alice", "bob");
  await follow(dbAs(env, "bob"), "bob", "alice");
  await seedPost(env, "20260929_alice", "alice", new Date(Date.now() - 3600_000));
  await seedPost(env, "20260929_bob", "bob", new Date(Date.now() - 1800_000));
});

test("Activity: a friend's prayer, and their comment and reaction on mine; gone when unfriended", async () => {
  const db = dbAs(env, "alice");
  const scope = new FriendScope(db, "alice");
  const feed = new FeedStore(db, scope);
  const activity = new ActivityStore(db, scope, feed);
  let items: Activity[] = [];
  feed.start();
  activity.start();
  activity.subscribe((a) => { items = a; });
  scope.start();
  try {
    await addComment(dbAs(env, "bob"), "20260929_alice", "bob", "Praying with you");
    await react(dbAs(env, "bob"), "20260929_alice", "bob", "praying");
    await until(() => items.length === 3, 8000);
    expect(items.map((a) => a.kind).sort()).toEqual(["commented", "posted", "reacted"]);
    expect(items.every((a) => a.actorId === "bob")).toBe(true);

    await removeFriend(db, "alice", "bob");
    await until(() => !scope.isFriend("bob"));
    expect(items).toEqual([]);
  } finally {
    activity.stop();
    feed.stop();
    scope.stop();
  }
});
