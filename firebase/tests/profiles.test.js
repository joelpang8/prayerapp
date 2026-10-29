import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
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
    await assertFails(updateDoc(doc(db, "users", "alice"), { username: "bob_p" })); // not a full swap
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

describe("changing my username", () => {
  beforeEach(async () => {
    await seedUser(env, "alice", "alice_p");
    await seedUser(env, "bob", "bob_p");
  });

  const swap = (db, uid, from, to) => {
    const b = writeBatch(db);
    b.update(doc(db, "users", uid), { username: to });
    b.set(doc(db, "usernames", to), { uid });
    b.delete(doc(db, "usernames", from));
    return b.commit();
  };

  test("one batch: profile points at the new name, the new name is claimed, the old one released", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(swap(db, "alice", "alice_p", "alice_new"));
    let after;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const adb = ctx.firestore();
      after = {
        profile: (await getDoc(doc(adb, "users", "alice"))).data().username,
        newClaim: (await getDoc(doc(adb, "usernames", "alice_new"))).data()?.uid,
        oldClaim: (await getDoc(doc(adb, "usernames", "alice_p"))).exists(),
      };
    });
    expect(after).toEqual({ profile: "alice_new", newClaim: "alice", oldClaim: false });
    // The released name is free for anyone afterwards.
    await assertSucceeds(swap(signedInAs(env, "bob"), "bob", "bob_p", "alice_p"));
  });

  test("can't take someone else's name", async () => {
    await assertFails(swap(signedInAs(env, "alice"), "alice", "alice_p", "bob_p"));
  });

  test("can't keep the old name (claim a second one) or skip the claim", async () => {
    const db = signedInAs(env, "alice");
    // New claim + profile update, but the old claim kept: two names.
    const keepOld = writeBatch(db);
    keepOld.update(doc(db, "users", "alice"), { username: "alice_new" });
    keepOld.set(doc(db, "usernames", "alice_new"), { uid: "alice" });
    await assertFails(keepOld.commit());
    // Profile update and release, without claiming the new name.
    const noClaim = writeBatch(db);
    noClaim.update(doc(db, "users", "alice"), { username: "alice_new" });
    noClaim.delete(doc(db, "usernames", "alice_p"));
    await assertFails(noClaim.commit());
    // A claim alone, with the profile unchanged.
    await assertFails(setDoc(doc(db, "usernames", "alice_new"), { uid: "alice" }));
  });

  test("can't release a name without moving to a new one, or release someone else's", async () => {
    await assertFails(deleteDoc(doc(signedInAs(env, "alice"), "usernames", "alice_p")));
    await assertFails(deleteDoc(doc(signedInAs(env, "alice"), "usernames", "bob_p")));
    // Bob can't release Alice's name even while changing his own.
    const db = signedInAs(env, "bob");
    const b = writeBatch(db);
    b.update(doc(db, "users", "bob"), { username: "bob_new" });
    b.set(doc(db, "usernames", "bob_new"), { uid: "bob" });
    b.delete(doc(db, "usernames", "alice_p"));
    await assertFails(b.commit());
  });

  test("the new name must be valid, different, and not change anything else at the same time", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(swap(db, "alice", "alice_p", "Alice!"));
    await assertFails(swap(db, "alice", "alice_p", "al"));
    const extra = writeBatch(db);
    extra.update(doc(db, "users", "alice"), { username: "alice_new", displayName: "Someone" });
    extra.set(doc(db, "usernames", "alice_new"), { uid: "alice" });
    extra.delete(doc(db, "usernames", "alice_p"));
    await assertFails(extra.commit());
  });

  test("nobody else can change my username", async () => {
    const db = signedInAs(env, "bob");
    const b = writeBatch(db);
    b.update(doc(db, "users", "alice"), { username: "alice_new" });
    b.set(doc(db, "usernames", "alice_new"), { uid: "alice" });
    b.delete(doc(db, "usernames", "alice_p"));
    await assertFails(b.commit());
  });
});
