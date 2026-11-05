import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { seed, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// config/app: which TestFlight build is newest, for the "new version" banner.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seed(env, (db) => setDoc(doc(db, "config", "app"), { latestBuild: 7, minimumBuild: 5 }));
});

describe("app version setting", () => {
  test("anyone signed in can read it", async () => {
    await assertSucceeds(getDoc(doc(signedInAs(env, "alice"), "config", "app")));
  });

  test("nobody can change it from the app, list config, or read it signed out", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(doc(db, "config", "app"), { latestBuild: 1 }));
    await assertFails(setDoc(doc(db, "config", "other"), { x: 1 }));
    await assertFails(getDoc(doc(db, "config", "other")));
    await assertFails(getDocs(collection(db, "config")));
    await assertFails(getDoc(doc(signedOut(env), "config", "app")));
  });
});
