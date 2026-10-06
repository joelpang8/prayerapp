import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getMetadata, ref } from "firebase/storage";
import { follow } from "../src/lib/friends";
import { createPost, deletePost, editPost, isLate, setAnswered, watchMyPosts, watchMyPostsBetween, type Post } from "../src/lib/posts";
import { watchLatestPrompt, type Prompt } from "../src/lib/prompts";
import { clearBucket, dbAs, seedPrompt, seedUser, setupEnv, storageAs, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 0xff, 0xd9]);
let prompt: Prompt;

beforeEach(async () => {
  await env.clearFirestore();
  await clearBucket(env);
  await seedUser(env, "alice");
  await seedUser(env, "bob");
  prompt = { id: "20260929", firedAt: await seedPrompt(env, "20260929", 1), verseRef: null };
});

function watchMine(uid: string) {
  const state: { posts: Post[] | null } = { posts: null };
  const stop = watchMyPosts(dbAs(env, uid), uid, (p) => { state.posts = p; });
  return { state, stop };
}

describe("posting against the real rules", () => {
  test("the prompt's verse reference is carried onto the post (reference only)", async () => {
    const withVerse = { id: "20261001", firedAt: await seedPrompt(env, "20261001", 1, "PHP.4.6-7"), verseRef: "PHP.4.6-7" };
    const mine = watchMine("alice");
    try {
      await createPost(dbAs(env, "alice"), storageAs(env, "alice"), {
        uid: "alice", prompt: withVerse, notes: "Peace", jpeg: JPEG, photoId: "v1",
      });
      await until(() => mine.state.posts?.length === 1);
      expect(mine.state.posts![0].verseRef).toBe("PHP.4.6-7");
    } finally {
      mine.stop();
    }
  });

  test("latest prompt is visible to the app", async () => {
    let seen: Prompt | null | undefined;
    const stop = watchLatestPrompt(dbAs(env, "alice"), (p) => { seen = p; });
    try {
      await until(() => seen !== undefined && seen !== null);
      expect(seen!.id).toBe("20260929");
    } finally {
      stop();
    }
  });

  test("create: photo uploaded, post appears in my history, on time", async () => {
    const mine = watchMine("alice");
    try {
      await createPost(dbAs(env, "alice"), storageAs(env, "alice"), {
        uid: "alice", prompt, notes: "  For Grandma's recovery  ", jpeg: JPEG, photoId: "photo1",
      });
      await until(() => mine.state.posts?.length === 1);
      const post = mine.state.posts![0];
      expect(post).toMatchObject({ id: "20260929_alice", notes: "For Grandma's recovery", editedAt: null });
      expect(isLate(post)).toBe(false);
      await expect(getMetadata(ref(storageAs(env, "alice"), post.photoPath))).resolves.toMatchObject({ contentType: "image/jpeg" });
    } finally {
      mine.stop();
    }
  });

  test("an opt-in place name is stored with the post and can be removed by editing", async () => {
    const mine = watchMine("alice");
    try {
      await createPost(dbAs(env, "alice"), storageAs(env, "alice"), {
        uid: "alice", prompt, notes: "From the park", jpeg: JPEG, photoId: "place1", place: "Austin, Texas",
      });
      await until(() => mine.state.posts?.[0]?.place === "Austin, Texas");
      await editPost(dbAs(env, "alice"), storageAs(env, "alice"), mine.state.posts![0], { removePlace: true });
      await until(() => mine.state.posts?.[0]?.place === null && !!mine.state.posts?.[0]?.editedAt);
    } finally {
      mine.stop();
    }
  });

  test("marking a prayer answered, changing the note, and unmarking it; not labelled edited", async () => {
    const mine = watchMine("alice");
    try {
      await createPost(dbAs(env, "alice"), storageAs(env, "alice"), {
        uid: "alice", prompt, notes: "For the job interview", jpeg: JPEG, photoId: "ans1",
      });
      await until(() => mine.state.posts?.length === 1);
      await setAnswered(dbAs(env, "alice"), mine.state.posts![0], true, "  Got the job!  ");
      await until(() => mine.state.posts?.[0]?.answerNote === "Got the job!" && !!mine.state.posts?.[0]?.answeredAt);
      const firstAnsweredAt = mine.state.posts![0].answeredAt!.getTime();
      expect(mine.state.posts![0].editedAt).toBeNull();

      await setAnswered(dbAs(env, "alice"), mine.state.posts![0], true, "");
      await until(() => mine.state.posts?.[0]?.answerNote === null);
      expect(mine.state.posts![0].answeredAt!.getTime()).toBe(firstAnsweredAt);

      await setAnswered(dbAs(env, "alice"), mine.state.posts![0], false);
      await until(() => mine.state.posts?.[0]?.answeredAt === null);
    } finally {
      mine.stop();
    }
  });

  test("a month's prayers: only mine, only in the range, newest first", async () => {
    await createPost(dbAs(env, "alice"), storageAs(env, "alice"), { uid: "alice", prompt, notes: "This month", jpeg: JPEG, photoId: "m1" });
    await createPost(dbAs(env, "bob"), storageAs(env, "bob"), { uid: "bob", prompt, notes: "Bob's", jpeg: JPEG, photoId: "m2" });
    const now = Date.now();
    const seen: { inRange: Post[] | null; before: Post[] | null } = { inRange: null, before: null };
    const stop1 = watchMyPostsBetween(dbAs(env, "alice"), "alice", new Date(now - 3600_000), new Date(now + 3600_000), (p) => { seen.inRange = p; });
    const stop2 = watchMyPostsBetween(dbAs(env, "alice"), "alice", new Date(now - 7200_000), new Date(now - 3600_000), (p) => { seen.before = p; });
    try {
      await until(() => seen.inRange?.length === 1 && seen.before !== null);
      expect(seen.inRange![0].notes).toBe("This month");
      expect(seen.before).toEqual([]);
    } finally {
      stop1();
      stop2();
    }
  });

  test("posting well after the prompt is allowed and labelled late", async () => {
    const old = { id: "20260928", firedAt: await seedPrompt(env, "20260928", 60), verseRef: null };
    const mine = watchMine("alice");
    try {
      await createPost(dbAs(env, "alice"), storageAs(env, "alice"), {
        uid: "alice", prompt: old, notes: "Late but here", jpeg: JPEG, photoId: "photo2",
      });
      await until(() => mine.state.posts?.length === 1);
      expect(isLate(mine.state.posts![0])).toBe(true);
    } finally {
      mine.stop();
    }
  });

  test("a second post for the same prompt is refused, and its photo is cleaned up", async () => {
    const db = dbAs(env, "alice");
    const storage = storageAs(env, "alice");
    await createPost(db, storage, { uid: "alice", prompt, notes: "first", jpeg: JPEG, photoId: "one" });
    await expect(createPost(db, storage, { uid: "alice", prompt, notes: "second", jpeg: JPEG, photoId: "two" })).rejects.toBeTruthy();
    await expect(getMetadata(ref(storage, "postPhotos/alice/two.jpg"))).rejects.toMatchObject({ code: "storage/object-not-found" });
  });

  test("edit notes and photo: marked edited, still on time", async () => {
    const db = dbAs(env, "alice");
    const storage = storageAs(env, "alice");
    const mine = watchMine("alice");
    try {
      await createPost(db, storage, { uid: "alice", prompt, notes: "before", jpeg: JPEG, photoId: "orig" });
      await until(() => mine.state.posts?.length === 1);
      await editPost(db, storage, mine.state.posts![0], { notes: "after", newPhoto: { jpeg: JPEG, photoId: "newer" } });
      await until(() => mine.state.posts?.[0].notes === "after" && mine.state.posts?.[0].editedAt !== null);
      const post = mine.state.posts![0];
      expect(post.photoPath).toBe("postPhotos/alice/newer.jpg");
      expect(isLate(post)).toBe(false);
    } finally {
      mine.stop();
    }
  });

  test("delete removes it from my history", async () => {
    const db = dbAs(env, "alice");
    const mine = watchMine("alice");
    try {
      await createPost(db, storageAs(env, "alice"), { uid: "alice", prompt, notes: "x", jpeg: JPEG, photoId: "gone" });
      await until(() => mine.state.posts?.length === 1);
      await deletePost(db, mine.state.posts![0]);
      await until(() => mine.state.posts?.length === 0);
    } finally {
      mine.stop();
    }
  });

  test("a pending friend request can't read my history", async () => {
    await createPost(dbAs(env, "alice"), storageAs(env, "alice"), { uid: "alice", prompt, notes: "x", jpeg: JPEG, photoId: "p" });
    await follow(dbAs(env, "bob"), "bob", "alice");
    let err: Error | null = null;
    const stop = watchMyPosts(dbAs(env, "bob"), "alice", () => {}, 50, (e) => { err = e; });
    try {
      await until(() => err !== null);
      expect((err as unknown as { code: string }).code).toBe("permission-denied");
    } finally {
      stop();
    }
  });
});
