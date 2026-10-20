import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc,
} from "firebase/firestore";
import { seed, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// Scripture memory: users/{uid}/savedVerses/{refId}, owner only.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
});

const verse = (db, ref, uid = "alice") => doc(db, "users", uid, "savedVerses", ref);
const save = (db, ref, extra = {}, uid = "alice") => setDoc(verse(db, ref, uid), { verseRef: ref, savedAt: serverTimestamp(), ...extra });
const list = (db, uid = "alice") => getDocs(query(collection(db, "users", uid, "savedVerses"), orderBy("savedAt", "desc")));

describe("saving a verse", () => {
  test("I can save verses, list them newest first, and unsave one", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(save(db, "PSA.46.10"));
    await assertSucceeds(save(db, "PHP.4.6-7"));
    await assertSucceeds(save(db, "PSA.23"));
    await assertSucceeds(save(db, "JHN.3.16-4.2"));
    const snap = await assertSucceeds(list(db));
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["JHN.3.16-4.2", "PHP.4.6-7", "PSA.23", "PSA.46.10"]);
    await assertSucceeds(deleteDoc(verse(db, "PSA.23")));
  });

  test("only the reference and the server time: never the verse text", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(save(db, "PSA.46.10", { text: "Be still, and know that I am God" }));
    await assertFails(save(db, "PSA.46.10", { note: "my favourite" }));
    await assertFails(save(db, "PSA.46.10", { savedAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(verse(db, "PSA.46.10"), { verseRef: "PSA.46.10" }));
  });

  test("the id is the reference, and must be a real reference id", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(verse(db, "PSA.46.10"), { verseRef: "PSA.46.11", savedAt: serverTimestamp() }));
    for (const bad of ["psalm 46", "PSA", "PSA.46.10;x", "PSA.46.10-", "PSALMS.1.1"]) await assertFails(save(db, bad));
  });

  test("a saved verse can't be changed, only removed", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(save(db, "PSA.46.10"));
    await assertFails(updateDoc(verse(db, "PSA.46.10"), { savedAt: serverTimestamp() }));
    await assertFails(save(db, "PSA.46.10"));
  });
});

describe("they're private", () => {
  beforeEach(async () => {
    await seedFriends(env, "alice", "bob");
    await seed(env, (db) => setDoc(verse(db, "PSA.46.10"), { verseRef: "PSA.46.10", savedAt: Timestamp.now() }));
  });

  test("not even a friend can read, list, add or remove them", async () => {
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(verse(bob, "PSA.46.10")));
    await assertFails(list(bob));
    await assertFails(save(bob, "PSA.23", {}, "alice"));
    await assertFails(deleteDoc(verse(bob, "PSA.46.10")));
  });

  test("signed-out users can't either", async () => {
    await assertFails(getDoc(verse(signedOut(env), "PSA.46.10")));
    await assertFails(list(signedOut(env)));
  });
});
