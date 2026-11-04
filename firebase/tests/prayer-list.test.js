import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, deleteField } from "firebase/firestore";
import { seed, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// My prayer list: users/{uid}/prayerList/{itemId}, owner only.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
});

const item = (db, id = "i1", uid = "alice") => doc(db, "users", uid, "prayerList", id);
const fields = (over = {}) => ({ name: "Mum", note: "Recovery after surgery", group: "family", often: "weekly", order: 0, createdAt: serverTimestamp(), ...over });

describe("my prayer list", () => {
  test("I can add, list, edit, mark answered, un-answer and remove", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(item(db), fields()));
    await assertSucceeds(setDoc(item(db, "i2"), fields({ name: "Our church plant", note: "", group: "Small group", often: "daily", order: 1 })));
    const snap = await assertSucceeds(getDocs(collection(db, "users", "alice", "prayerList")));
    expect(snap.size).toBe(2);
    await assertSucceeds(updateDoc(item(db), { note: "Home now", often: "monthly", order: 5, group: "friends" }));
    await assertSucceeds(updateDoc(item(db), { answeredAt: Timestamp.now(), answerNote: "Scan was clear" }));
    await assertSucceeds(updateDoc(item(db), { answeredAt: deleteField(), answerNote: deleteField() }));
    await assertSucceeds(deleteDoc(item(db)));
  });

  test("fields are checked", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(item(db), fields({ name: "" })));
    await assertFails(setDoc(item(db), fields({ name: "   " })));
    await assertFails(setDoc(item(db), fields({ name: "x".repeat(61) })));
    await assertFails(setDoc(item(db), fields({ note: "x".repeat(201) })));
    await assertFails(setDoc(item(db), fields({ group: "" })));
    await assertFails(setDoc(item(db), fields({ group: "x".repeat(31) })));
    await assertFails(setDoc(item(db), fields({ often: "hourly" })));
    await assertFails(setDoc(item(db), fields({ order: -1 })));
    await assertFails(setDoc(item(db), fields({ order: 1.5 })));
    await assertFails(setDoc(item(db), fields({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(item(db), { ...fields(), friendUid: "bob" }));
    await assertFails(setDoc(item(db), fields({ answerNote: "no date" })));
    await assertFails(setDoc(item(db, "bad.id"), fields()));
    await assertSucceeds(setDoc(item(db), fields()));
    await assertFails(updateDoc(item(db), { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(item(db), { answeredAt: Timestamp.now(), answerNote: "x".repeat(121) }));
  });

  test("nobody else can see or change it, not even a friend", async () => {
    await seedFriends(env, "alice", "bob");
    await seed(env, (db) => setDoc(item(db), { ...fields(), createdAt: Timestamp.now() }));
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(item(bob)));
    await assertFails(getDocs(collection(bob, "users", "alice", "prayerList")));
    await assertFails(updateDoc(item(bob), { note: "x" }));
    await assertFails(deleteDoc(item(bob)));
    await assertFails(setDoc(item(bob, "i9"), fields()));
    await assertFails(getDoc(item(signedOut(env))));
  });
});
