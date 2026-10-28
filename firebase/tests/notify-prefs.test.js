import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, getDoc, setDoc, doc, updateDoc } from "firebase/firestore";
import { seed, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// users/{uid}/private/notify: opt-in notification settings and the secret topic.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
});

const TOPIC = "n_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
const ref = (db, uid = "alice") => doc(db, "users", uid, "private", "notify");
const prefs = (over = {}) => ({ topic: TOPIC, taps: true, reactions: false, comments: true, lang: "en", ...over });

describe("notification settings", () => {
  test("I can save, read and change mine", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(ref(db), prefs()));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(updateDoc(ref(db), { reactions: true, lang: "es" }));
  });

  test("only these fields, a well-formed secret topic, true/false switches", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(ref(db), prefs({ topic: "prompt" })));
    await assertFails(setDoc(ref(db), prefs({ topic: "n_short" })));
    await assertFails(setDoc(ref(db), prefs({ taps: "yes" })));
    await assertFails(setDoc(ref(db), prefs({ lang: "fr" })));
    await assertFails(setDoc(ref(db), { ...prefs(), token: "abc" }));
    const { comments, ...missing } = prefs();
    void comments;
    await assertFails(setDoc(ref(db), missing));
  });

  test("nobody else can read or write them, not even a friend", async () => {
    await seed(env, (db) => setDoc(ref(db), prefs()));
    await seedFriends(env, "alice", "bob");
    const bob = signedInAs(env, "bob");
    await assertFails(getDoc(ref(bob)));
    await assertFails(setDoc(ref(bob), prefs()));
    await assertFails(getDoc(ref(signedOut(env))));
  });

  test("clients can't delete them (removed with the account)", async () => {
    await seed(env, (db) => setDoc(ref(db), prefs()));
    await assertFails(deleteDoc(ref(signedInAs(env, "alice"))));
  });
});
