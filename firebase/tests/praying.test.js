import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";
import { seed, seedFollow, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// "I'll pray for this": users/{owner}/prayingFor/{itemId}_{friendUid}.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const MUM = "reqmumhealth1";
const WORK = "reqwisdomwork";

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol", "dave"]) await seedUser(env, u);
  await seed(env, (db) => setDoc(doc(db, "users", "alice", "friendsOnly", "about"), {
    bio: "",
    prayerRequests: "Mum's health\nWisdom at work",
    requestIds: [MUM, WORK],
  }));
});

const tapRef = (db, owner, itemId, friend) => doc(db, "users", owner, "prayingFor", `${itemId}_${friend}`);
const tap = (uid, itemId = MUM, owner = "alice", extra = {}) =>
  setDoc(tapRef(signedInAs(env, uid), owner, itemId, uid), { friendUid: uid, itemId, createdAt: serverTimestamp(), ...extra });
const seedTap = (owner, itemId, friend) =>
  seed(env, (db) => setDoc(tapRef(db, owner, itemId, friend), { friendUid: friend, itemId, createdAt: Timestamp.now() }));
const allTaps = (db, owner = "alice") => getDocs(collection(db, "users", owner, "prayingFor"));
const myTaps = (db, me, owner = "alice") => getDocs(query(collection(db, "users", owner, "prayingFor"), where("friendUid", "==", me)));

describe("who can tap", () => {
  test("a current mutual friend can pray for a request, and undo it", async () => {
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(tap("bob"));
    await assertSucceeds(tap("bob", WORK));
    await assertSucceeds(deleteDoc(tapRef(signedInAs(env, "bob"), "alice", MUM, "bob")));
    // ...and tap again after undoing.
    await assertSucceeds(tap("bob"));
  });

  test("a stranger is refused", async () => {
    await assertFails(tap("carol"));
  });

  test("a pending friend is refused, whichever way the request goes", async () => {
    await seedFollow(env, "carol", "alice");
    await assertFails(tap("carol"));
    await seedFollow(env, "alice", "dave");
    await assertFails(tap("dave"));
  });

  test("a friend of a friend is refused", async () => {
    await seedFriends(env, "alice", "bob");
    await seedFriends(env, "bob", "carol");
    await assertFails(tap("carol"));
  });

  test("a removed friend is refused straight away", async () => {
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(tap("bob"));
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    await assertFails(tap("bob", WORK));
  });

  test("you can't pray-tap your own requests", async () => {
    await assertFails(tap("alice"));
  });

  test("signed-out users are refused", async () => {
    await assertFails(setDoc(tapRef(signedOut(env), "alice", MUM, "bob"), { friendUid: "bob", itemId: MUM, createdAt: serverTimestamp() }));
  });
});

describe("what a tap must be", () => {
  beforeEach(async () => { await seedFriends(env, "alice", "bob"); });

  test("only for a request the owner has right now", async () => {
    await assertFails(tap("bob", "reqnotthere1"));
    await seed(env, (db) => setDoc(doc(db, "users", "alice", "friendsOnly", "about"), { bio: "" }));
    await assertFails(tap("bob", MUM));
  });

  test("not if the owner has no about details at all", async () => {
    await seedFriends(env, "carol", "bob");
    await assertFails(tap("bob", MUM, "carol"));
  });

  test("one per friend per request: the doc id is the request and the friend", async () => {
    const db = signedInAs(env, "bob");
    await assertFails(setDoc(doc(db, "users", "alice", "prayingFor", "anything"), { friendUid: "bob", itemId: MUM, createdAt: serverTimestamp() }));
    await assertFails(setDoc(tapRef(db, "alice", WORK, "bob"), { friendUid: "bob", itemId: MUM, createdAt: serverTimestamp() }));
    await assertSucceeds(tap("bob"));
    // Tapping again is an update, which nobody can do.
    await assertFails(tap("bob"));
    await assertFails(updateDoc(tapRef(db, "alice", MUM, "bob"), { createdAt: serverTimestamp() }));
  });

  test("you can't tap in someone else's name", async () => {
    await seedFriends(env, "alice", "carol");
    await assertFails(setDoc(tapRef(signedInAs(env, "bob"), "alice", MUM, "carol"), { friendUid: "carol", itemId: MUM, createdAt: serverTimestamp() }));
  });

  test("only friendUid, itemId and the server time", async () => {
    await assertFails(tap("bob", MUM, "alice", { note: "praying!" }));
    await assertFails(tap("bob", MUM, "alice", { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(tapRef(signedInAs(env, "bob"), "alice", MUM, "bob"), { friendUid: "bob", itemId: MUM }));
  });

  test("only the friend who tapped can undo it", async () => {
    await seedFriends(env, "alice", "carol");
    await seedTap("alice", MUM, "bob");
    await assertFails(deleteDoc(tapRef(signedInAs(env, "carol"), "alice", MUM, "bob")));
  });

  test("a removed friend can still take their own tap back", async () => {
    await seedTap("alice", MUM, "bob");
    await deleteDoc(doc(signedInAs(env, "bob"), "follows", "bob_alice"));
    await assertSucceeds(deleteDoc(tapRef(signedInAs(env, "bob"), "alice", MUM, "bob")));
  });
});

describe("who can see taps", () => {
  beforeEach(async () => {
    await seedFriends(env, "alice", "bob");
    await seedFriends(env, "alice", "carol");
    await seedTap("alice", MUM, "bob");
    await seedTap("alice", WORK, "carol");
  });

  test("the owner can list them all", async () => {
    const snap = await assertSucceeds(allTaps(signedInAs(env, "alice")));
    expect(snap.docs.map((d) => d.id).sort()).toEqual([`${MUM}_bob`, `${WORK}_carol`]);
  });

  test("a friend sees only their own taps", async () => {
    const bob = signedInAs(env, "bob");
    await assertSucceeds(getDoc(tapRef(bob, "alice", MUM, "bob")));
    const snap = await assertSucceeds(myTaps(bob, "bob"));
    expect(snap.docs.map((d) => d.id)).toEqual([`${MUM}_bob`]);
  });

  test("other friends can't read who tapped, or how many", async () => {
    const carol = signedInAs(env, "carol");
    await assertFails(getDoc(tapRef(carol, "alice", MUM, "bob")));
    await assertFails(allTaps(carol));
    await assertFails(myTaps(carol, "bob"));
  });

  test("strangers and signed-out users can't read any", async () => {
    await assertFails(allTaps(signedInAs(env, "dave")));
    await assertFails(myTaps(signedInAs(env, "dave"), "dave"));
    await assertFails(getDoc(tapRef(signedOut(env), "alice", MUM, "bob")));
  });

  test("a removed friend can't read even their own taps", async () => {
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(tapRef(bob, "alice", MUM, "bob")));
    await assertFails(myTaps(bob, "bob"));
  });

  test("taps on my requests aren't visible on anyone else's profile", async () => {
    // Bob is Alice's friend, but Alice's taps live under Alice only.
    await assertFails(allTaps(signedInAs(env, "bob"), "carol"));
  });
});
