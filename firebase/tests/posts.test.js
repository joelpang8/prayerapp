import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where,
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

// Friends' queries must ask only for shared posts, or the rules refuse them
// (a private post could otherwise match). The author's own needn't.
const postsBy = (db, authorId) =>
  query(collection(db, "posts"), where("authorId", "==", authorId), where("visibility", "==", "friends"));

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
      getDocs(query(collection(db, "posts"), where("authorId", "in", ["alice", "bob"]), where("visibility", "==", "friends"))));
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["alicePost", "bobPost"]);
  });

  test("'in' query is rejected outright if it includes a single non-friend", async () => {
    await seedFriends(env, "dave", "alice");
    const db = signedInAs(env, "dave");
    await assertFails(getDocs(query(collection(db, "posts"), where("authorId", "in", ["alice", "carol"]), where("visibility", "==", "friends"))));
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

describe("private posts (a journal only the author sees)", () => {
  beforeEach(async () => {
    await seedPost(env, "alicePrivate", "alice", { visibility: "private", photoPath: "privatePhotos/alice/p1.jpg" });
    await seedFriends(env, "alice", "bob");
  });

  test("the author can read it; a current friend can't, by id or by any query", async () => {
    await assertSucceeds(getDoc(doc(signedInAs(env, "alice"), "posts", "alicePrivate")));
    await assertSucceeds(getDocs(query(collection(signedInAs(env, "alice"), "posts"), where("authorId", "==", "alice"))));
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(doc(bob, "posts", "alicePrivate")));
    // A friend's query that doesn't ask for shared posts only is refused outright.
    await assertFails(getDocs(query(collection(bob, "posts"), where("authorId", "==", "alice"))));
    const shared = await getDocs(postsBy(bob, "alice"));
    expect(shared.docs.map((d) => d.id)).toEqual(["alicePost"]);
  });

  test("nobody can comment on or react to it, not even a friend", async () => {
    const bob = signedInAs(env, "bob");
    await assertFails(setDoc(doc(bob, "posts", "alicePrivate", "comments", "c1"), { authorId: "bob", text: "hi", createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(bob, "posts", "alicePrivate", "reactions", "bob"), { authorId: "bob", kind: "love", createdAt: serverTimestamp() }));
  });
});

// The Prayers tab: my own posts only, including private ones, filtered by
// answered, verse book, exact verse, or "on this day" (prompt ids).
describe("Prayers tab queries", () => {
  beforeEach(async () => {
    await seedPost(env, "20251008_alice", "alice", { promptId: "20251008", verseRef: "PHP.4.6-7", verseBook: "PHP", answeredAt: Timestamp.now() });
    await seedPost(env, "20241008_alice", "alice", { promptId: "20241008", visibility: "private", photoPath: "privatePhotos/alice/p.jpg", verseRef: "PHP.4.13", verseBook: "PHP" });
    await seedFriends(env, "alice", "bob");
  });

  const mine = (db, uid, ...filters) => getDocs(query(collection(db, "posts"), where("authorId", "==", uid), ...filters));

  test("I can run every filter on my own posts, private ones included", async () => {
    const alice = signedInAs(env, "alice");
    const ids = async (...f) => (await assertSucceeds(mine(alice, "alice", ...f))).docs.map((d) => d.id).sort();
    expect(await ids(where("answeredAt", ">=", Timestamp.fromMillis(0)), orderBy("answeredAt", "desc"))).toEqual(["20251008_alice"]);
    expect(await ids(where("verseBook", "==", "PHP"))).toEqual(["20241008_alice", "20251008_alice"]);
    expect(await ids(where("verseRef", "==", "PHP.4.13"))).toEqual(["20241008_alice"]);
    expect(await ids(where("promptId", "in", ["20251008", "20241008", "20231008"]))).toEqual(["20241008_alice", "20251008_alice"]);
  });

  test("a friend running the same queries on my posts is refused (they could include private ones)", async () => {
    const bob = signedInAs(env, "bob");
    await assertFails(mine(bob, "alice", where("verseBook", "==", "PHP")));
    await assertFails(mine(bob, "alice", where("promptId", "in", ["20251008", "20241008"])));
    await assertFails(mine(bob, "alice", where("answeredAt", ">=", Timestamp.fromMillis(0)), orderBy("answeredAt", "desc")));
  });

  test("a stranger is refused even when asking for shared posts only", async () => {
    await assertFails(mine(signedInAs(env, "carol"), "alice", where("visibility", "==", "friends"), where("verseBook", "==", "PHP")));
  });
});
