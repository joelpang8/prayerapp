import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, or, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import {
  anonymousUser, followDoc, seedFollow, seedUser, setupEnv, signedInAs, signedOut,
} from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
  await seedUser(env, "carol");
});

describe("creating follows (friend requests)", () => {
  test("user can follow another existing user", async () => {
    await assertSucceeds(followDoc(signedInAs(env, "alice"), "alice", "bob"));
  });

  test("cannot create a follow on someone else's behalf (forging friendship)", async () => {
    await assertFails(followDoc(signedInAs(env, "alice"), "bob", "alice"));
  });

  test("doc id must match follower_followee", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(doc(db, "follows", "bob_alice"), {
      followerId: "alice", followeeId: "bob", createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(db, "follows", "whatever"), {
      followerId: "alice", followeeId: "bob", createdAt: serverTimestamp(),
    }));
  });

  test("cannot follow self", async () => {
    await assertFails(followDoc(signedInAs(env, "alice"), "alice", "alice"));
  });

  test("cannot follow a user that doesn't exist", async () => {
    await assertFails(followDoc(signedInAs(env, "alice"), "alice", "ghost"));
  });

  test("cannot follow before creating own profile", async () => {
    await assertFails(followDoc(signedInAs(env, "noprofile"), "noprofile", "bob"));
  });

  test("uids containing the separator are rejected", async () => {
    await seedUser(env, "b_ob", "b_ob");
    await assertFails(followDoc(signedInAs(env, "alice"), "alice", "b_ob"));
  });

  test("extra fields and spoofed timestamps rejected", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(doc(db, "follows", "alice_bob"), {
      followerId: "alice", followeeId: "bob", createdAt: serverTimestamp(), accepted: true,
    }));
    await assertFails(setDoc(doc(db, "follows", "alice_bob"), {
      followerId: "alice", followeeId: "bob", createdAt: new Date(0),
    }));
  });

  test("anonymous and signed-out users cannot follow", async () => {
    await seedUser(env, "anon");
    await assertFails(followDoc(anonymousUser(env, "anon"), "anon", "bob"));
    await assertFails(followDoc(signedOut(env), "alice", "bob"));
  });
});

describe("follow edges are immutable", () => {
  test("cannot rewrite an existing edge", async () => {
    await seedFollow(env, "alice", "bob");
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(doc(db, "follows", "alice_bob"), { followeeId: "carol" }));
    await assertFails(updateDoc(doc(signedInAs(env, "bob"), "follows", "alice_bob"), { followerId: "bob" }));
  });
});

describe("reading follows (who can see the social graph)", () => {
  beforeEach(async () => {
    await seedFollow(env, "alice", "bob");
    await seedFollow(env, "carol", "bob");
  });

  test("follower sees own outgoing requests", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(doc(db, "follows", "alice_bob")));
    await assertSucceeds(getDocs(query(collection(db, "follows"), where("followerId", "==", "alice"))));
  });

  test("followee sees incoming requests", async () => {
    const db = signedInAs(env, "bob");
    await assertSucceeds(getDoc(doc(db, "follows", "alice_bob")));
    await assertSucceeds(getDocs(query(collection(db, "follows"), where("followeeId", "==", "bob"))));
  });

  test("third party cannot see other people's edges", async () => {
    const db = signedInAs(env, "carol");
    await assertFails(getDoc(doc(db, "follows", "alice_bob")));
    await assertFails(getDocs(query(collection(db, "follows"), where("followeeId", "==", "bob"))));
    await assertFails(getDocs(query(collection(db, "follows"), where("followerId", "==", "alice"))));
  });

  test("the app's single 'either direction' query works for yourself only", async () => {
    const mine = (db, uid) => query(collection(db, "follows"),
      or(where("followerId", "==", uid), where("followeeId", "==", uid)));
    await assertSucceeds(getDocs(mine(signedInAs(env, "bob"), "bob")));
    await assertFails(getDocs(mine(signedInAs(env, "carol"), "bob")));
    await assertFails(getDocs(query(collection(signedInAs(env, "carol"), "follows"),
      or(where("followerId", "==", "carol"), where("followeeId", "==", "bob")))));
  });

  test("unconstrained queries over follows are denied", async () => {
    await assertFails(getDocs(collection(signedInAs(env, "bob"), "follows")));
  });

  test("signed-out user cannot read follows", async () => {
    await assertFails(getDoc(doc(signedOut(env), "follows", "alice_bob")));
  });
});

describe("deleting follows (cancel / decline / unfriend)", () => {
  beforeEach(async () => { await seedFollow(env, "alice", "bob"); });

  test("follower can cancel", async () => {
    await assertSucceeds(deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob")));
  });

  test("followee can decline / remove", async () => {
    await assertSucceeds(deleteDoc(doc(signedInAs(env, "bob"), "follows", "alice_bob")));
  });

  test("third party cannot delete", async () => {
    await assertFails(deleteDoc(doc(signedInAs(env, "carol"), "follows", "alice_bob")));
  });
});
