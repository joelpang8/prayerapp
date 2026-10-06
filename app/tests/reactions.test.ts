import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { follow, removeFriend } from "../src/lib/friends";
import { FriendScope } from "../src/lib/friendScope";
import { react, ReactionThread, summarize, unreact, type Reaction } from "../src/lib/reactions";
import { dbAs, seedPost, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

// Alice posts. Bob and Carol are both her friends but not each other's.
const POST = { id: "20260929_alice", authorId: "alice" };

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol", "dave"]) await seedUser(env, u);
  await seedPost(env, POST.id, "alice");
  await befriend("alice", "bob");
  await befriend("alice", "carol");
});

function open(uid: string) {
  const scope = new FriendScope(dbAs(env, uid), uid);
  const errors: Error[] = [];
  const thread = new ReactionThread(dbAs(env, uid), scope, POST, { onError: (e) => errors.push(e) });
  let reactions: Reaction[] = [];
  thread.start();
  thread.subscribe((r) => { reactions = r; });
  scope.start();
  return {
    scope,
    errors,
    get: () => reactions,
    stop: () => { thread.stop(); scope.stop(); },
  };
}

describe("reactions against the real rules", () => {
  test("the author sees friends' reactions live; one per person, changeable and removable", async () => {
    const alice = open("alice");
    try {
      await react(dbAs(env, "bob"), POST.id, "bob", "praying");
      await react(dbAs(env, "carol"), POST.id, "carol", "praying");
      await until(() => alice.get().length === 2);
      expect(summarize(alice.get())).toEqual([{ kind: "praying", emoji: "🙏", count: 2 }]);

      await react(dbAs(env, "bob"), POST.id, "bob", "love");
      await until(() => alice.get().some((r) => r.authorId === "bob" && r.kind === "love"));
      expect(alice.get()).toHaveLength(2);

      await unreact(dbAs(env, "carol"), POST.id, "carol");
      await until(() => alice.get().length === 1);
      expect(alice.errors).toEqual([]);
    } finally {
      alice.stop();
    }
  });

  test("a friend of the author doesn't see a non-friend's reaction", async () => {
    await react(dbAs(env, "carol"), POST.id, "carol", "hug");
    const bob = open("bob");
    try {
      await react(dbAs(env, "bob"), POST.id, "bob", "amen");
      await until(() => bob.get().length === 1);
      expect(bob.get()[0].authorId).toBe("bob");
      expect(bob.errors).toEqual([]);
    } finally {
      bob.stop();
    }
  });

  test("unfriending drops their reaction from memory at once", async () => {
    await react(dbAs(env, "bob"), POST.id, "bob", "cool");
    const alice = open("alice");
    try {
      await until(() => alice.get().length === 1);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => !alice.scope.isFriend("bob"));
      expect(alice.get()).toEqual([]);
    } finally {
      alice.stop();
    }
  });

  test("you can't react to your own post, and strangers can't react", async () => {
    await expect(react(dbAs(env, "alice"), POST.id, "alice", "love")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(react(dbAs(env, "dave"), POST.id, "dave", "love")).rejects.toMatchObject({ code: "permission-denied" });
  });
});
