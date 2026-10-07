import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { followDoc, seed, seedFriends, seedUser, setupEnv, signedInAs } from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol"]) await seedUser(env, u);
});

const blockRef = (db, blocker, blocked) => doc(db, "blocks", `${blocker}_${blocked}`);
const block = (db, blocker, blocked) => ({ blocker, blocked, createdAt: serverTimestamp() });

describe("blocking", () => {
  test("blocking ends the friendship in one batch, and stops me sending a request until I unblock", async () => {
    await seedFriends(env, "alice", "bob");
    const alice = signedInAs(env, "alice");
    const batch = writeBatch(alice);
    batch.set(blockRef(alice, "alice", "bob"), block(alice, "alice", "bob"));
    batch.delete(doc(alice, "follows", "alice_bob"));
    batch.delete(doc(alice, "follows", "bob_alice"));
    await assertSucceeds(batch.commit());
    await assertFails(followDoc(alice, "alice", "bob"));
    await assertSucceeds(deleteDoc(blockRef(alice, "alice", "bob")));
    await assertSucceeds(followDoc(alice, "alice", "bob"));
  });

  test("the blocked person isn't told: they can't see the block, and their request still 'sends'", async () => {
    await seed(env, (db) => setDoc(blockRef(db, "alice", "bob"), { blocker: "alice", blocked: "bob", createdAt: Timestamp.now() }));
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(blockRef(bob, "alice", "bob")));
    await assertSucceeds(followDoc(bob, "bob", "alice"));
    // ...but it can never become a friendship while the block stands.
    const alice = signedInAs(env, "alice");
    await assertFails(followDoc(alice, "alice", "bob"));
  });

  test("only the blocker can create, list or remove their blocks", async () => {
    const alice = signedInAs(env, "alice");
    const carol = signedInAs(env, "carol");
    await assertFails(setDoc(blockRef(carol, "alice", "bob"), block(carol, "alice", "bob")));
    await assertFails(setDoc(blockRef(alice, "alice", "bob"), { blocker: "alice", blocked: "carol", createdAt: serverTimestamp() }));
    await assertFails(setDoc(blockRef(alice, "alice", "alice"), block(alice, "alice", "alice")));
    await assertSucceeds(setDoc(blockRef(alice, "alice", "bob"), block(alice, "alice", "bob")));
    await assertSucceeds(getDocs(query(collection(alice, "blocks"), where("blocker", "==", "alice"))));
    await assertFails(getDocs(query(collection(carol, "blocks"), where("blocker", "==", "alice"))));
    await assertFails(deleteDoc(blockRef(carol, "alice", "bob")));
    await assertFails(updateDoc(blockRef(alice, "alice", "bob"), { blocked: "carol" }));
  });
});

describe("reports", () => {
  const report = (overrides = {}) => ({
    reporter: "alice", kind: "post", targetUid: "bob", postId: "p1", reason: "inappropriate", createdAt: serverTimestamp(), ...overrides,
  });

  test("anyone signed in can file one; nobody can read, change or delete it from the app", async () => {
    const alice = signedInAs(env, "alice");
    const ref = await addDoc(collection(alice, "reports"), report({ note: "Not okay", excerpt: "the post text" }));
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(alice, "reports")));
    await assertFails(updateDoc(ref, { reason: "spam" }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(signedInAs(env, "bob"), "reports", ref.id)));
  });

  test("users, posts and comments, with the right ids", async () => {
    const alice = signedInAs(env, "alice");
    await assertSucceeds(addDoc(collection(alice, "reports"), { reporter: "alice", kind: "user", targetUid: "bob", reason: "harassment", createdAt: serverTimestamp() }));
    await assertSucceeds(addDoc(collection(alice, "reports"), report({ kind: "comment", commentId: "c1", reason: "spam" })));
    await assertFails(addDoc(collection(alice, "reports"), report({ kind: "comment" })));
    await assertFails(addDoc(collection(alice, "reports"), { reporter: "alice", kind: "post", targetUid: "bob", reason: "spam", createdAt: serverTimestamp() }));
  });

  test("can't report as someone else, report yourself, use an unknown reason, or backdate", async () => {
    const alice = signedInAs(env, "alice");
    await assertFails(addDoc(collection(alice, "reports"), report({ reporter: "bob" })));
    await assertFails(addDoc(collection(alice, "reports"), report({ targetUid: "alice" })));
    await assertFails(addDoc(collection(alice, "reports"), report({ reason: "boring" })));
    await assertFails(addDoc(collection(alice, "reports"), report({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(addDoc(collection(alice, "reports"), report({ note: "x".repeat(501) })));
  });
});

describe("hidden (things I reported, hidden from my view)", () => {
  const hidden = (db, uid, key) => doc(db, "users", uid, "hidden", key);

  test("only I can add, read and remove my hidden list", async () => {
    const alice = signedInAs(env, "alice");
    await assertSucceeds(setDoc(hidden(alice, "alice", "post_p1"), { createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(hidden(alice, "alice", "comment_p1_c1"), { createdAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(alice, "users", "alice", "hidden")));
    const bob = signedInAs(env, "bob");
    await assertFails(getDocs(collection(bob, "users", "alice", "hidden")));
    await assertFails(setDoc(hidden(bob, "alice", "post_p2"), { createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(hidden(alice, "alice", "post_p1")));
  });

  test("keys and fields are checked", async () => {
    const alice = signedInAs(env, "alice");
    await assertFails(setDoc(hidden(alice, "alice", "user_bob"), { createdAt: serverTimestamp() }));
    await assertFails(setDoc(hidden(alice, "alice", "post_p1"), { createdAt: serverTimestamp(), note: "x" }));
  });
});
