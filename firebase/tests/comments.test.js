import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";
import { seed, seedFollow, seedFriends, seedPost, seedUser, setupEnv, signedInAs } from "./helpers.js";

// Each test uses a fresh post id: clearing the emulator between tests
// deletes the previous post, and the cleanup function's late deletion of its
// comments must not hit this test's data.
let n = 0;
let POST;

// Alice posts. Bob and Carol are both Alice's friends, but not each other's.
// Dave is a stranger. Eve is friends with Bob only.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol", "dave", "eve"]) await seedUser(env, u);
  POST = `alicePost${++n}`;
  await seedPost(env, POST, "alice");
  await seedFriends(env, "alice", "bob");
  await seedFriends(env, "alice", "carol");
  await seedFriends(env, "bob", "eve");
});

const comments = (db, postId = POST) => collection(db, "posts", postId, "comments");
const comment = (uid, text = "Praying with you") => ({ authorId: uid, text, createdAt: serverTimestamp() });

async function seedComment(id, authorId, postId = POST) {
  await seed(env, (db) =>
    setDoc(doc(db, "posts", postId, "comments", id), { authorId, text: `from ${authorId}`, createdAt: Timestamp.now() }));
}

const commentsBy = (db, authors, postId = POST) => query(comments(db, postId), where("authorId", "in", authors));

describe("writing a comment", () => {
  test("the post's author and their friends can comment", async () => {
    await assertSucceeds(addDoc(comments(signedInAs(env, "alice")), comment("alice")));
    await assertSucceeds(addDoc(comments(signedInAs(env, "bob")), comment("bob")));
  });

  test("a stranger, a pending request or a friend of a friend can't", async () => {
    await assertFails(addDoc(comments(signedInAs(env, "dave")), comment("dave")));
    await seedFollow(env, "dave", "alice");
    await assertFails(addDoc(comments(signedInAs(env, "dave")), comment("dave")));
    await assertFails(addDoc(comments(signedInAs(env, "eve")), comment("eve")));
  });

  test("can't comment as someone else, or on a post that doesn't exist", async () => {
    await assertFails(addDoc(comments(signedInAs(env, "bob")), comment("carol")));
    await assertFails(addDoc(comments(signedInAs(env, "bob"), "missing"), comment("bob")));
  });

  test("text must be 1–500 characters and not just spaces; time must be the server's", async () => {
    const db = signedInAs(env, "bob");
    await assertFails(addDoc(comments(db), comment("bob", "")));
    await assertFails(addDoc(comments(db), comment("bob", "   ")));
    await assertFails(addDoc(comments(db), comment("bob", "x".repeat(501))));
    await assertSucceeds(addDoc(comments(db), comment("bob", "x".repeat(500))));
    await assertFails(addDoc(comments(db), { authorId: "bob", text: "hi", createdAt: Timestamp.fromMillis(0) }));
    await assertFails(addDoc(comments(db), { ...comment("bob"), likes: 5 }));
  });

  test("comments can't be edited", async () => {
    await seedComment("c1", "bob");
    await assertFails(updateDoc(doc(comments(signedInAs(env, "bob")), "c1"), { text: "changed" }));
  });
});

describe("who can read a comment", () => {
  beforeEach(async () => {
    await seedComment("byBob", "bob");
    await seedComment("byCarol", "carol");
  });

  test("the post's author reads every friend's comment", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(doc(comments(db), "byBob")));
    await assertSucceeds(getDocs(commentsBy(db, ["alice", "bob", "carol"])));
  });

  test("a friend of the author reads comments only from their own friends (and themselves)", async () => {
    const bob = signedInAs(env, "bob");
    await assertSucceeds(getDoc(doc(comments(bob), "byBob")));
    // Bob and Carol aren't friends: Carol's comment stays hidden from Bob.
    await assertFails(getDoc(doc(comments(bob), "byCarol")));
    // The app queries only its own friends and itself.
    await assertSucceeds(getDocs(commentsBy(bob, ["bob", "alice"])));
    await assertFails(getDocs(commentsBy(bob, ["bob", "carol"])));
  });

  test("being friends with the commenter isn't enough without seeing the post", async () => {
    // Eve is Bob's friend but not Alice's.
    const eve = signedInAs(env, "eve");
    await assertFails(getDoc(doc(comments(eve), "byBob")));
    await assertFails(getDocs(commentsBy(eve, ["bob"])));
  });

  test("a stranger reads nothing", async () => {
    const dave = signedInAs(env, "dave");
    await assertFails(getDoc(doc(comments(dave), "byBob")));
    await assertFails(getDocs(commentsBy(dave, ["alice", "bob", "carol"])));
  });

  test("unfriending hides comments in both directions, straight away", async () => {
    await seed(env, async (db) => {
      await deleteDoc(doc(db, "follows", "alice_bob"));
    });
    // Alice can no longer read Bob's comment on her own post...
    await assertFails(getDoc(doc(comments(signedInAs(env, "alice")), "byBob")));
    // ...and Bob can't read Alice's thread any more, though his own comment is still his.
    await seedComment("byAlice", "alice");
    await assertFails(getDoc(doc(comments(signedInAs(env, "bob")), "byAlice")));
    await assertSucceeds(getDoc(doc(comments(signedInAs(env, "bob")), "byBob")));
  });

  test("comments on a deleted post can't be read, even before the cleanup function removes them", async () => {
    await seed(env, (db) => deleteDoc(doc(db, "posts", POST)));
    await assertFails(getDoc(doc(comments(signedInAs(env, "alice")), "byBob")));
    await assertFails(getDocs(commentsBy(signedInAs(env, "alice"), ["bob", "carol"])));
  });
});

describe("deleting a comment", () => {
  beforeEach(async () => {
    await seedComment("byBob", "bob");
    await seedComment("byCarol", "carol");
  });

  test("the commenter can delete their own", async () => {
    await assertSucceeds(deleteDoc(doc(comments(signedInAs(env, "bob")), "byBob")));
  });

  test("the post's author can delete any comment on their post", async () => {
    await assertSucceeds(deleteDoc(doc(comments(signedInAs(env, "alice")), "byCarol")));
  });

  test("nobody else can", async () => {
    await assertFails(deleteDoc(doc(comments(signedInAs(env, "bob")), "byCarol")));
    await assertFails(deleteDoc(doc(comments(signedInAs(env, "dave")), "byBob")));
  });
});
