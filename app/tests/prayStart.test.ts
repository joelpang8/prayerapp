import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { createPost, isLate, watchMyPosts, type Post } from "../src/lib/posts";
import { beginPraying, cancelPraying, readStart } from "../src/lib/prayStart";
import { clearBucket, dbAs, seedPrompt, seedUser, setupEnv, storageAs, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await clearBucket(env);
  await seedUser(env, "alice");
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 0xff, 0xd9]);

describe("Pray now against the real rules", () => {
  test("starting in time, then posting with it: on time", async () => {
    const firedAt = await seedPrompt(env, "20261028", 3);
    const db = dbAs(env, "alice");
    const start = await beginPraying(db, "alice", "20261028");
    expect(start).not.toBeNull();
    // Pressing again keeps the same start.
    expect(await beginPraying(db, "alice", "20261028")).toEqual(start);
    let posts: Post[] = [];
    const stop = watchMyPosts(db, "alice", (p) => { posts = p; });
    try {
      await createPost(db, storageAs(env, "alice"), {
        uid: "alice", prompt: { id: "20261028", firedAt, verseRef: null }, notes: "Peace", jpeg: JPEG, photoId: "p1", startedAt: start,
      });
      await until(() => posts.length === 1 && !!posts[0].startedAt);
      expect(isLate(posts[0])).toBe(false);
    } finally {
      stop();
    }
  });

  test("too late to start: no start, and cancelling removes one", async () => {
    await seedPrompt(env, "20261028", 9);
    const db = dbAs(env, "alice");
    expect(await beginPraying(db, "alice", "20261028")).toBeNull();
    await seedPrompt(env, "20261029", 1);
    expect(await beginPraying(db, "alice", "20261029")).not.toBeNull();
    await cancelPraying(db, "alice", "20261029");
    expect(await readStart(db, "alice", "20261029")).toBeNull();
  });
});
