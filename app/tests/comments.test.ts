import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addComment, CommentThread, deleteComment, type Comment } from "../src/lib/comments";
import { follow, removeFriend } from "../src/lib/friends";
import { FriendScope } from "../src/lib/friendScope";
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

function open(uid: string, chunkSize?: number) {
  const scope = new FriendScope(dbAs(env, uid), uid);
  const errors: Error[] = [];
  const thread = new CommentThread(dbAs(env, uid), scope, POST, { chunkSize, onError: (e) => errors.push(e) });
  let comments: Comment[] = [];
  thread.start();
  thread.subscribe((c) => { comments = c; });
  scope.start();
  return {
    scope,
    thread,
    errors,
    authors: () => comments.map((c) => c.authorId),
    texts: () => comments.map((c) => c.text),
    stop: () => { thread.stop(); scope.stop(); },
  };
}

describe("comment threads against the real rules", () => {
  test("the post's author sees every friend's comment, oldest first, as they arrive", async () => {
    const alice = open("alice");
    try {
      await addComment(dbAs(env, "bob"), POST.id, "bob", "  Praying with you  ");
      await addComment(dbAs(env, "carol"), POST.id, "carol", "Amen");
      await until(() => alice.texts().length === 2);
      expect(alice.texts()).toEqual(["Praying with you", "Amen"]);
      expect(alice.errors).toEqual([]);
    } finally {
      alice.stop();
    }
  });

  test("a friend sees only comments from their own friends, never a stranger's words", async () => {
    await addComment(dbAs(env, "carol"), POST.id, "carol", "from carol");
    await addComment(dbAs(env, "alice"), POST.id, "alice", "from alice");
    const bob = open("bob");
    try {
      await addComment(dbAs(env, "bob"), POST.id, "bob", "from bob");
      await until(() => bob.authors().length === 2);
      expect(bob.authors().sort()).toEqual(["alice", "bob"]);
      expect(bob.errors).toEqual([]);
    } finally {
      bob.stop();
    }
  });

  test("works across several query chunks", async () => {
    await addComment(dbAs(env, "bob"), POST.id, "bob", "b");
    await addComment(dbAs(env, "carol"), POST.id, "carol", "c");
    const alice = open("alice", 1);
    try {
      await until(() => alice.authors().length === 2);
      expect(alice.errors).toEqual([]);
    } finally {
      alice.stop();
    }
  });

  test("unfriending drops that friend's comments from memory at once", async () => {
    await addComment(dbAs(env, "bob"), POST.id, "bob", "from bob");
    await addComment(dbAs(env, "carol"), POST.id, "carol", "from carol");
    const alice = open("alice");
    try {
      await until(() => alice.authors().length === 2);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => !alice.scope.isFriend("bob"));
      expect(alice.authors()).toEqual(["carol"]);
    } finally {
      alice.stop();
    }
  });

  test("when the post's author unfriends you, the whole thread goes", async () => {
    await addComment(dbAs(env, "alice"), POST.id, "alice", "from alice");
    await addComment(dbAs(env, "bob"), POST.id, "bob", "from bob");
    const bob = open("bob");
    try {
      await until(() => bob.authors().length === 2);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => !bob.scope.isFriend("alice"));
      expect(bob.authors()).toEqual([]);
    } finally {
      bob.stop();
    }
  });

  test("a stranger can't comment", async () => {
    await expect(addComment(dbAs(env, "dave"), POST.id, "dave", "hi")).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("commenter and post author can delete; another friend can't", async () => {
    await addComment(dbAs(env, "bob"), POST.id, "bob", "one");
    await addComment(dbAs(env, "bob"), POST.id, "bob", "two");
    const alice = open("alice");
    try {
      await until(() => alice.texts().length === 2);
      const [first, second] = alice.thread.comments;
      await expect(deleteComment(dbAs(env, "carol"), POST.id, first.id)).rejects.toMatchObject({ code: "permission-denied" });
      await deleteComment(dbAs(env, "bob"), POST.id, first.id);
      await deleteComment(dbAs(env, "alice"), POST.id, second.id);
      await until(() => alice.texts().length === 0);
    } finally {
      alice.stop();
    }
  });

  test("an empty or too-long comment is refused before it's sent", async () => {
    await expect(addComment(dbAs(env, "bob"), POST.id, "bob", "   ")).rejects.toThrow();
    await expect(addComment(dbAs(env, "bob"), POST.id, "bob", "x".repeat(501))).rejects.toThrow(/500/);
  });
});
