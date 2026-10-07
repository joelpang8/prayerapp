import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";

// The real outbox wiring against the real rules; only the phone's storage
// and the photo file are stand-ins.
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => { store.set(k, v); },
    removeItem: async (k: string) => { store.delete(k); },
  },
}));
vi.mock("../src/lib/capture", () => ({
  photoBlob: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 0xff, 0xd9]),
}));
const { createOutbox } = await import("../src/lib/outboxApp");
const { watchMyPosts } = await import("../src/lib/posts");
const { dbAs, seedPrompt, seedUser, setupEnv, storageAs, until } = await import("./env");
import type { Post } from "../src/lib/posts";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  store.clear();
  await seedUser(env, "alice");
});

test("a queued post sends with takenAt, and a second flush doesn't post twice", async () => {
  const firedAt = await seedPrompt(env, "20261007", 1);
  const takenAt = Date.now() - 30_000;
  const box = createOutbox(dbAs(env, "alice"), storageAs(env, "alice"), "alice");
  let posts: Post[] = [];
  const stop = watchMyPosts(dbAs(env, "alice"), "alice", (p) => { posts = p; });
  try {
    await box.enqueue({
      postId: "20261007_alice", uid: "alice", prompt: { id: "20261007", firedAt: firedAt.getTime(), verseRef: null },
      notes: "From the outbox", photoUri: "file:///x.jpg", photoId: "ob1", place: null, visibility: "friends", takenAt,
    });
    await box.flush();
    await until(() => posts.length === 1);
    expect(posts[0].takenAt?.getTime()).toBe(takenAt);
    expect(box.all).toEqual([]);
    expect(store.size).toBe(0);

    // The same post queued again (e.g. the app closed before it noticed):
    // it's found on the server and not sent twice.
    await box.enqueue({
      postId: "20261007_alice", uid: "alice", prompt: { id: "20261007", firedAt: firedAt.getTime(), verseRef: null },
      notes: "From the outbox", photoUri: "file:///x.jpg", photoId: "ob2", place: null, visibility: "friends", takenAt,
    });
    await box.flush();
    expect(box.all).toEqual([]);
  } finally {
    stop();
  }
});

test("a post for a prompt that closed over 24 hours ago is refused and kept for Retry/Discard", async () => {
  const firedAt = await seedPrompt(env, "20261005", 60 * 25);
  const box = createOutbox(dbAs(env, "alice"), storageAs(env, "alice"), "alice");
  await box.enqueue({
    postId: "20261005_alice", uid: "alice", prompt: { id: "20261005", firedAt: firedAt.getTime(), verseRef: null },
    notes: "Too late", photoUri: "file:///x.jpg", photoId: "ob3", place: null, visibility: "friends", takenAt: firedAt.getTime(),
  });
  await box.flush();
  expect(box.all[0]).toMatchObject({ status: "failed" });
});
