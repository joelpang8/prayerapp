import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import {
  anonymousUser, createProfileBatch, seedUser, setupEnv, signedInAs, signedOut,
} from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("sign-up: profile + username claim", () => {
  test("user can create own profile and claim a free username in one batch", async () => {
    await assertSucceeds(createProfileBatch(signedInAs(env, "alice"), "alice", "alice_p"));
  });

  test("profile without username claim is rejected", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(doc(db, "users", "alice"), {
      username: "alice_p", displayName: "A", createdAt: serverTimestamp(),
    }));
  });

  test("username claim without profile is rejected", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(doc(db, "usernames", "alice_p"), { uid: "alice" }));
  });

  test("cannot take a username someone else owns", async () => {
    await seedUser(env, "bob", "taken");
    await assertFails(createProfileBatch(signedInAs(env, "alice"), "alice", "taken"));
  });

  test("cannot claim a second username after profile exists", async () => {
    await seedUser(env, "alice", "alice_p");
    await assertFails(setDoc(doc(signedInAs(env, "alice"), "usernames", "alice2"), { uid: "alice" }));
  });

  test("cannot create a profile for another uid", async () => {
    await assertFails(createProfileBatch(signedInAs(env, "mallory"), "alice", "alice_p"));
  });

  test("cannot claim a username pointing at another uid", async () => {
    const db = signedInAs(env, "mallory");
    const batch = writeBatch(db);
    batch.set(doc(db, "users", "mallory"), { username: "x_x", displayName: "M", createdAt: serverTimestamp() });
    batch.set(doc(db, "usernames", "x_x"), { uid: "alice" });
    await assertFails(batch.commit());
  });

  test.each(["ab", "Alice", "has space", "a".repeat(21), "émoji"])(
    "invalid username %j rejected", async (name) => {
      await assertFails(createProfileBatch(signedInAs(env, "alice"), "alice", name));
    });

  test("extra profile fields rejected", async () => {
    const db = signedInAs(env, "alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "users", "alice"), {
      username: "alice_p", displayName: "A", createdAt: serverTimestamp(), isAdmin: true,
    });
    batch.set(doc(db, "usernames", "alice_p"), { uid: "alice" });
    await assertFails(batch.commit());
  });

  test("client-supplied createdAt rejected", async () => {
    const db = signedInAs(env, "alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "users", "alice"), { username: "alice_p", displayName: "A", createdAt: new Date(0) });
    batch.set(doc(db, "usernames", "alice_p"), { uid: "alice" });
    await assertFails(batch.commit());
  });

  test("anonymous and signed-out users cannot sign up", async () => {
    await assertFails(createProfileBatch(anonymousUser(env, "anon"), "anon", "anon_user"));
    await assertFails(createProfileBatch(signedOut(env), "nobody", "nobody"));
  });
});

describe("profile reads and updates", () => {
  beforeEach(async () => {
    await seedUser(env, "alice", "alice_p");
    await seedUser(env, "bob", "bob_p");
  });

  test("signed-in user can get another user's profile and username lookup", async () => {
    const db = signedInAs(env, "bob");
    await assertSucceeds(getDoc(doc(db, "users", "alice")));
    await assertSucceeds(getDoc(doc(db, "usernames", "alice_p")));
  });

  test("signed-out and anonymous users cannot read profiles", async () => {
    await assertFails(getDoc(doc(signedOut(env), "users", "alice")));
    await assertFails(getDoc(doc(anonymousUser(env, "anon"), "usernames", "alice_p")));
  });

  test("users and usernames cannot be enumerated", async () => {
    const db = signedInAs(env, "bob");
    await assertFails(getDocs(collection(db, "users")));
    await assertFails(getDocs(collection(db, "usernames")));
  });

  test("user can change own display name only", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(updateDoc(doc(db, "users", "alice"), { displayName: "Alice P." }));
    await assertFails(updateDoc(doc(db, "users", "alice"), { username: "bob_p" }));
    await assertFails(updateDoc(doc(db, "users", "alice"), { displayName: "" }));
  });

  test("user cannot edit someone else's profile", async () => {
    await assertFails(updateDoc(doc(signedInAs(env, "bob"), "users", "alice"), { displayName: "pwned" }));
  });

  test("profiles and usernames cannot be deleted or reassigned by clients", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(deleteDoc(doc(db, "users", "alice")));
    await assertFails(deleteDoc(doc(db, "usernames", "alice_p")));
    await assertFails(setDoc(doc(signedInAs(env, "bob"), "usernames", "alice_p"), { uid: "bob" }));
  });
});
