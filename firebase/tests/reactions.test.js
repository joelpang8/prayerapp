import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import { seed, seedFollow, seedFriends, seedPost, seedUser, setupEnv, signedInAs } from "./helpers.js";

// Alice posts. Bob and Carol are both her friends but not each other's.
// Dave is a stranger. Eve is friends with Bob only.
// A fresh post id per test, so a cleanup function still running from an
// earlier test can't touch this one's data.
let env;
let n = 0;
let POST;
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

const reaction = (db, uid) => doc(db, "posts", POST, "reactions", uid);
const react = (uid, kind = "praying", as = uid) =>
  setDoc(reaction(signedInAs(env, as), uid), { authorId: uid, kind, createdAt: serverTimestamp() });
const reactionsBy = (db, authors) => query(collection(db, "posts", POST, "reactions"), where("authorId", "in", authors));
const seedReaction = (uid, kind = "praying") =>
  seed(env, (db) => setDoc(doc(db, "posts", POST, "reactions", uid), { authorId: uid, kind, createdAt: Timestamp.now() }));

describe("reacting", () => {
  test("a friend of the author can react with a preset, and change or remove it", async () => {
    await assertSucceeds(react("bob", "praying"));
    await assertSucceeds(react("bob", "love"));
    await assertSucceeds(deleteDoc(reaction(signedInAs(env, "bob"), "bob")));
  });

  test("only the presets", async () => {
    for (const kind of ["praying", "love", "happy", "amen", "cool", "hug"]) await assertSucceeds(react("bob", kind));
    await assertFails(react("bob", "angry"));
    await assertFails(react("bob", "🔥"));
  });

  test("one per person: the doc id is your own uid, and you can't react as someone else", async () => {
    await assertFails(setDoc(reaction(signedInAs(env, "bob"), "carol"), { authorId: "carol", kind: "love", createdAt: serverTimestamp() }));
    await assertFails(setDoc(reaction(signedInAs(env, "bob"), "bob"), { authorId: "carol", kind: "love", createdAt: serverTimestamp() }));
  });

  test("not on your own post, and not by strangers, pending requests or friends of friends", async () => {
    await assertFails(react("alice"));
    await assertFails(react("dave"));
    await seedFollow(env, "dave", "alice");
    await assertFails(react("dave"));
    await assertFails(react("eve"));
  });

  test("server time, no extra fields, and the post must exist", async () => {
    const db = signedInAs(env, "bob");
    await assertFails(setDoc(reaction(db, "bob"), { authorId: "bob", kind: "love", createdAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(reaction(db, "bob"), { authorId: "bob", kind: "love", createdAt: serverTimestamp(), note: "hi" }));
    await assertFails(setDoc(doc(db, "posts", "missing", "reactions", "bob"), { authorId: "bob", kind: "love", createdAt: serverTimestamp() }));
  });

  test("nobody can delete someone else's reaction, not even the post's author", async () => {
    await seedReaction("bob");
    await assertFails(deleteDoc(reaction(signedInAs(env, "carol"), "bob")));
    await assertFails(deleteDoc(reaction(signedInAs(env, "alice"), "bob")));
  });
});

describe("who sees a reaction", () => {
  beforeEach(async () => {
    await seedReaction("bob", "praying");
    await seedReaction("carol", "love");
  });

  test("the post's author sees their friends' reactions", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(reaction(db, "bob")));
    await assertSucceeds(getDocs(reactionsBy(db, ["alice", "bob", "carol"])));
  });

  test("a friend of the author sees only reactions from their own friends and themselves", async () => {
    const bob = signedInAs(env, "bob");
    await assertSucceeds(getDoc(reaction(bob, "bob")));
    await assertFails(getDoc(reaction(bob, "carol")));
    await assertSucceeds(getDocs(reactionsBy(bob, ["bob", "alice"])));
    await assertFails(getDocs(reactionsBy(bob, ["bob", "carol"])));
  });

  test("being friends with the reactor isn't enough without seeing the post; strangers see nothing", async () => {
    await assertFails(getDoc(reaction(signedInAs(env, "eve"), "bob")));
    await assertFails(getDocs(reactionsBy(signedInAs(env, "dave"), ["bob", "carol"])));
  });

  test("unfriending hides reactions straight away", async () => {
    await seed(env, (db) => deleteDoc(doc(db, "follows", "alice_bob")));
    await assertFails(getDoc(reaction(signedInAs(env, "alice"), "bob")));
    await assertSucceeds(getDoc(reaction(signedInAs(env, "bob"), "bob")));
  });
});
