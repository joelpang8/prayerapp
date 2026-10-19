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

// Fresh names for every test: a cleanup trigger from an earlier test (e.g.
// deleting taps after an unfriend) can run late and must not touch this one.
const U = { alice: "", bob: "", carol: "", dave: "" };
let n = 0;

const MUM = "reqmumhealth1";
const WORK = "reqwisdomwork";

beforeEach(async () => {
  await env.clearFirestore();
  n += 1;
  for (const name of Object.keys(U)) U[name] = `${name}${n}`;
  for (const u of Object.values(U)) await seedUser(env, u);
  await seed(env, (db) => setDoc(doc(db, "users", U.alice, "friendsOnly", "about"), {
    bio: "",
    prayerRequests: "Mum's health\nWisdom at work",
    requestIds: [MUM, WORK],
  }));
});

const tapRef = (db, owner, itemId, friend) => doc(db, "users", owner, "prayingFor", `${itemId}_${friend}`);
const tap = (uid, itemId = MUM, owner = U.alice, extra = {}) =>
  setDoc(tapRef(signedInAs(env, uid), owner, itemId, uid), { friendUid: uid, itemId, createdAt: serverTimestamp(), ...extra });
const seedTap = (owner, itemId, friend) =>
  seed(env, (db) => setDoc(tapRef(db, owner, itemId, friend), { friendUid: friend, itemId, createdAt: Timestamp.now() }));
const allTaps = (db, owner = U.alice) => getDocs(collection(db, "users", owner, "prayingFor"));
const myTaps = (db, me, owner = U.alice) => getDocs(query(collection(db, "users", owner, "prayingFor"), where("friendUid", "==", me)));

describe("who can tap", () => {
  test("a current mutual friend can pray for a request, and undo it", async () => {
    await seedFriends(env, U.alice, U.bob);
    await assertSucceeds(tap(U.bob));
    await assertSucceeds(tap(U.bob, WORK));
    await assertSucceeds(deleteDoc(tapRef(signedInAs(env, U.bob), U.alice, MUM, U.bob)));
    // ...and tap again after undoing.
    await assertSucceeds(tap(U.bob));
  });

  test("a stranger is refused", async () => {
    await assertFails(tap(U.carol));
  });

  test("a pending friend is refused, whichever way the request goes", async () => {
    await seedFollow(env, U.carol, U.alice);
    await assertFails(tap(U.carol));
    await seedFollow(env, U.alice, U.dave);
    await assertFails(tap(U.dave));
  });

  test("a friend of a friend is refused", async () => {
    await seedFriends(env, U.alice, U.bob);
    await seedFriends(env, U.bob, U.carol);
    await assertFails(tap(U.carol));
  });

  test("a removed friend is refused straight away", async () => {
    await seedFriends(env, U.alice, U.bob);
    await assertSucceeds(tap(U.bob));
    await deleteDoc(doc(signedInAs(env, U.alice), "follows", `${U.alice}_${U.bob}`));
    await assertFails(tap(U.bob, WORK));
  });

  test("you can't pray-tap your own requests", async () => {
    await assertFails(tap(U.alice));
  });

  test("signed-out users are refused", async () => {
    await assertFails(setDoc(tapRef(signedOut(env), U.alice, MUM, U.bob), { friendUid: U.bob, itemId: MUM, createdAt: serverTimestamp() }));
  });
});

describe("what a tap must be", () => {
  beforeEach(async () => { await seedFriends(env, U.alice, U.bob); });

  test("only for a request the owner has right now", async () => {
    await assertFails(tap(U.bob, "reqnotthere1"));
    await seed(env, (db) => setDoc(doc(db, "users", U.alice, "friendsOnly", "about"), { bio: "" }));
    await assertFails(tap(U.bob, MUM));
  });

  test("not if the owner has no about details at all", async () => {
    await seedFriends(env, U.carol, U.bob);
    await assertFails(tap(U.bob, MUM, U.carol));
  });

  test("one per friend per request: the doc id is the request and the friend", async () => {
    const db = signedInAs(env, U.bob);
    await assertFails(setDoc(doc(db, "users", U.alice, "prayingFor", "anything"), { friendUid: U.bob, itemId: MUM, createdAt: serverTimestamp() }));
    await assertFails(setDoc(tapRef(db, U.alice, WORK, U.bob), { friendUid: U.bob, itemId: MUM, createdAt: serverTimestamp() }));
    await assertSucceeds(tap(U.bob));
    // Tapping again is an update, which nobody can do.
    await assertFails(tap(U.bob));
    await assertFails(updateDoc(tapRef(db, U.alice, MUM, U.bob), { createdAt: serverTimestamp() }));
  });

  test("you can't tap in someone else's name", async () => {
    await seedFriends(env, U.alice, U.carol);
    await assertFails(setDoc(tapRef(signedInAs(env, U.bob), U.alice, MUM, U.carol), { friendUid: U.carol, itemId: MUM, createdAt: serverTimestamp() }));
  });

  test("only friendUid, itemId and the server time", async () => {
    await assertFails(tap(U.bob, MUM, U.alice, { note: "praying!" }));
    await assertFails(tap(U.bob, MUM, U.alice, { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(tapRef(signedInAs(env, U.bob), U.alice, MUM, U.bob), { friendUid: U.bob, itemId: MUM }));
  });

  test("only the friend who tapped can undo it", async () => {
    await seedFriends(env, U.alice, U.carol);
    await seedTap(U.alice, MUM, U.bob);
    await assertFails(deleteDoc(tapRef(signedInAs(env, U.carol), U.alice, MUM, U.bob)));
  });

  test("someone who isn't a friend any more can still take their own tap back", async () => {
    // Not friends now (dave never followed alice back), but his old tap is
    // still there. Seeded without unfriending, so the cleanup function (which
    // deletes taps on unfriend) can't race the test.
    await seedTap(U.alice, MUM, U.dave);
    await assertSucceeds(deleteDoc(tapRef(signedInAs(env, U.dave), U.alice, MUM, U.dave)));
  });
});

describe("who can see taps", () => {
  beforeEach(async () => {
    await seedFriends(env, U.alice, U.bob);
    await seedFriends(env, U.alice, U.carol);
    await seedTap(U.alice, MUM, U.bob);
    await seedTap(U.alice, WORK, U.carol);
  });

  test("the owner can list them all", async () => {
    const snap = await assertSucceeds(allTaps(signedInAs(env, U.alice)));
    expect(snap.docs.map((d) => d.id).sort()).toEqual([`${MUM}_${U.bob}`, `${WORK}_${U.carol}`]);
  });

  test("a friend sees only their own taps", async () => {
    const bob = signedInAs(env, U.bob);
    await assertSucceeds(getDoc(tapRef(bob, U.alice, MUM, U.bob)));
    const snap = await assertSucceeds(myTaps(bob, U.bob));
    expect(snap.docs.map((d) => d.id)).toEqual([`${MUM}_${U.bob}`]);
  });

  test("other friends can't read who tapped, or how many", async () => {
    const carol = signedInAs(env, U.carol);
    await assertFails(getDoc(tapRef(carol, U.alice, MUM, U.bob)));
    await assertFails(allTaps(carol));
    await assertFails(myTaps(carol, U.bob));
  });

  test("strangers and signed-out users can't read any", async () => {
    await assertFails(allTaps(signedInAs(env, U.dave)));
    await assertFails(myTaps(signedInAs(env, U.dave), U.dave));
    await assertFails(getDoc(tapRef(signedOut(env), U.alice, MUM, U.bob)));
  });

  test("a removed friend can't read even their own taps", async () => {
    await deleteDoc(doc(signedInAs(env, U.alice), "follows", `${U.alice}_${U.bob}`));
    const bob = signedInAs(env, U.bob);
    await assertFails(getDoc(tapRef(bob, U.alice, MUM, U.bob)));
    await assertFails(myTaps(bob, U.bob));
  });

  test("taps on my requests aren't visible on anyone else's profile", async () => {
    // Bob is Alice's friend, but Alice's taps live under Alice only.
    await assertFails(allTaps(signedInAs(env, U.bob), U.carol));
  });
});
