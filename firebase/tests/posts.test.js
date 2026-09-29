import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import {
  anonymousUser, seedFollow, seedFriends, seedPost, seedUser, setupEnv, signedInAs, signedOut,
} from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol", "dave"]) await seedUser(env, u);
  await seedPost(env, "alicePost", "alice");
  await seedPost(env, "bobPost", "bob");
  await seedPost(env, "carolPost", "carol");
});

const postsBy = (db, authorId) => query(collection(db, "posts"), where("authorId", "==", authorId));

describe("who can read a post", () => {
  test("author can read own posts (history view)", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(doc(db, "posts", "alicePost")));
    await assertSucceeds(getDocs(postsBy(db, "alice")));
  });

  test("stranger cannot read", async () => {
    const db = signedInAs(env, "dave");
    await assertFails(getDoc(doc(db, "posts", "alicePost")));
    await assertFails(getDocs(postsBy(db, "alice")));
  });

  test("one-way follow (pending request) grants nothing, in either direction", async () => {
    await seedFollow(env, "dave", "alice");
    await assertFails(getDoc(doc(signedInAs(env, "dave"), "posts", "alicePost")));
    await assertFails(getDocs(postsBy(signedInAs(env, "dave"), "alice")));
    // Being followed doesn't let you read your follower's posts either.
    await seedPost(env, "davePost", "dave");
    await assertFails(getDoc(doc(signedInAs(env, "alice"), "posts", "davePost")));
  });

  test("mutual friends can read each other's posts", async () => {
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(getDoc(doc(signedInAs(env, "bob"), "posts", "alicePost")));
    await assertSucceeds(getDocs(postsBy(signedInAs(env, "bob"), "alice")));
    await assertSucceeds(getDoc(doc(signedInAs(env, "alice"), "posts", "bobPost")));
  });

  test("friendship is not transitive (friend of a friend can't read)", async () => {
    await seedFriends(env, "alice", "bob");
    await seedFriends(env, "bob", "carol");
    await assertFails(getDoc(doc(signedInAs(env, "carol"), "posts", "alicePost")));
    await assertFails(getDocs(postsBy(signedInAs(env, "carol"), "alice")));
  });

  test("signed-out and anonymous users cannot read", async () => {
    await assertFails(getDoc(doc(signedOut(env), "posts", "alicePost")));
    await assertFails(getDoc(doc(anonymousUser(env, "anon"), "posts", "alicePost")));
  });

  test("unconstrained or mis-constrained post queries are denied", async () => {
    await seedFriends(env, "alice", "bob");
    const db = signedInAs(env, "bob");
    await assertFails(getDocs(collection(db, "posts")));
    await assertFails(getDocs(query(collection(db, "posts"), where("notes", "!=", ""))));
  });

  test("probing a non-existent post id reveals nothing", async () => {
    await assertFails(getDoc(doc(signedInAs(env, "dave"), "posts", "doesNotExist")));
  });
});

describe("feed query over several friends", () => {
  test("'in' query succeeds when every author is a friend", async () => {
    await seedFriends(env, "dave", "alice");
    await seedFriends(env, "dave", "bob");
    const db = signedInAs(env, "dave");
    const snap = await assertSucceeds(
      getDocs(query(collection(db, "posts"), where("authorId", "in", ["alice", "bob"]))));
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["alicePost", "bobPost"]);
  });

  test("'in' query is rejected outright if it includes a single non-friend", async () => {
    await seedFriends(env, "dave", "alice");
    const db = signedInAs(env, "dave");
    await assertFails(getDocs(query(collection(db, "posts"), where("authorId", "in", ["alice", "carol"]))));
  });
});

describe("removing a friend revokes access immediately", () => {
  beforeEach(async () => { await seedFriends(env, "alice", "bob"); });

  test("when the author unfriends (deletes their own follow)", async () => {
    const bob = signedInAs(env, "bob");
    await assertSucceeds(getDoc(doc(bob, "posts", "alicePost")));
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    await assertFails(getDoc(doc(bob, "posts", "alicePost")));
    await assertFails(getDocs(postsBy(bob, "alice")));
  });

  test("when the author removes the friend's follow of them", async () => {
    const bob = signedInAs(env, "bob");
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "bob_alice"));
    await assertFails(getDoc(doc(bob, "posts", "alicePost")));
  });

  test("the removed friend cannot restore access by re-following", async () => {
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "bob_alice"));
    const bob = signedInAs(env, "bob");
    await assertSucceeds(setDoc(doc(bob, "follows", "bob_alice"), {
      followerId: "bob", followeeId: "alice", createdAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(bob, "posts", "alicePost")));
  });

  test("an open real-time listener is cut off and never receives later posts", async () => {
    const bob = signedInAs(env, "bob");
    const seen = new Set();
    let errorCode = null;
    let resolveFirst;
    const firstSnap = new Promise((r) => { resolveFirst = r; });
    const unsub = onSnapshot(
      postsBy(bob, "alice"),
      (snap) => { snap.docs.forEach((d) => seen.add(d.id)); resolveFirst(); },
      (err) => { errorCode = err.code; },
    );
    try {
      await firstSnap;
      expect(seen).toEqual(new Set(["alicePost"]));

      await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
      // Rules are re-evaluated when the listener's results next change, so the
      // cut-off happens on the next post rather than the moment of unfriending.
      await seedPost(env, "alicePostAfterUnfriend", "alice");
      await expect.poll(() => errorCode, { timeout: 5000 }).toBe("permission-denied");
      expect(seen.has("alicePostAfterUnfriend")).toBe(false);
    } finally {
      unsub();
    }
  });
});
