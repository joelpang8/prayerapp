import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { anonymousUser, seed, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
});

const settings = (db, uid = "alice") => doc(db, "users", uid, "private", "settings");

describe("preferred translation setting", () => {
  test("owner can choose KJV and read it back", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(settings(db), { bibleVersion: "KJV" }));
    await assertSucceeds(getDoc(settings(db)));
    await assertSucceeds(updateDoc(settings(db), { bibleVersion: "KJV" }));
  });

  test("owner can read it before it exists (the app then defaults to KJV)", async () => {
    await assertSucceeds(getDoc(settings(signedInAs(env, "alice"))));
  });

  test("translations not on the allowed list are rejected (licence gate)", async () => {
    const db = signedInAs(env, "alice");
    for (const v of ["NIV", "ESV", "kjv", "", 1, null]) {
      await assertFails(setDoc(settings(db), { bibleVersion: v }));
    }
  });

  test("no other fields", async () => {
    await assertFails(setDoc(settings(signedInAs(env, "alice")), { bibleVersion: "KJV", theme: "dark" }));
    await assertFails(setDoc(settings(signedInAs(env, "alice")), {}));
  });

  test("only the settings doc exists under private/", async () => {
    await assertFails(setDoc(doc(signedInAs(env, "alice"), "users", "alice", "private", "other"), { bibleVersion: "KJV" }));
  });

  test("friends and strangers can't read or write it", async () => {
    await seed(env, (db) => setDoc(settings(db), { bibleVersion: "KJV" }));
    await seedFriends(env, "alice", "bob");
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(settings(bob)));
    await assertFails(setDoc(settings(bob), { bibleVersion: "KJV" }));
    await assertFails(getDocs(collection(bob, "users", "alice", "private")));
  });

  test("signed-out and anonymous users can't touch it", async () => {
    await assertFails(getDoc(settings(signedOut(env))));
    await assertFails(setDoc(settings(anonymousUser(env, "alice")), { bibleVersion: "KJV" }));
  });

  test("clients can't delete it (removed with the account in step 5)", async () => {
    await seed(env, (db) => setDoc(settings(db), { bibleVersion: "KJV" }));
    await assertFails(deleteDoc(settings(signedInAs(env, "alice"))));
  });

  test("the owner can't list their private collection either", async () => {
    await assertFails(getDocs(collection(signedInAs(env, "alice"), "users", "alice", "private")));
  });
});

describe("verse index (the books and verses of my own prayers)", () => {
  const verseIndex = (db, uid = "alice") => doc(db, "users", uid, "private", "verseIndex");
  beforeEach(async () => {
    await seed(env, (db) => setDoc(verseIndex(db), { books: { PHP: 1 }, refs: { "PHP.4.6-7": 1 } }));
  });

  test("the owner can read it", async () => {
    await assertSucceeds(getDoc(verseIndex(signedInAs(env, "alice"))));
  });

  test("only the Cloud Function writes it, not even the owner", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(verseIndex(db), { books: { JHN: 99 } }));
    await assertFails(updateDoc(verseIndex(db), { books: { JHN: 99 } }));
    await assertFails(deleteDoc(verseIndex(db)));
  });

  test("friends, strangers and signed-out users can't read it", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(getDoc(verseIndex(signedInAs(env, "bob"))));
    await assertFails(getDoc(verseIndex(signedOut(env))));
  });
});
