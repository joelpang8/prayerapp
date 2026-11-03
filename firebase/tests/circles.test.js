import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where,
} from "firebase/firestore";
import { seed, seedFriends, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// Prayer circles: circles/{circleId} and circles/{circleId}/circleRequests/{id}.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const USERS = ["lead", "ann", "ben", "cat", "dan"];
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of USERS) await seedUser(env, u);
});

const circle = (db, id = "c1") => doc(db, "circles", id);
const req = (db, id = "r1", c = "c1") => doc(db, "circles", c, "circleRequests", id);
const as = (uid) => signedInAs(env, uid);

/** A circle led by "lead" with members and invited people already set. */
async function seedCircle({ members = ["lead"], invited = [], id = "c1" } = {}) {
  await seed(env, (db) => setDoc(circle(db, id), { name: "Small group", leaderId: "lead", memberIds: members, invitedIds: invited, createdAt: Timestamp.now() }));
}
async function seedRequest(authorId, extra = {}, id = "r1") {
  await seed(env, (db) => setDoc(req(db, id), { authorId, text: "Pray for my dad", createdAt: Timestamp.now(), prayedBy: [], ...extra }));
}

describe("creating a circle", () => {
  const create = (uid, data = {}) =>
    setDoc(circle(as(uid)), { name: "Small group", leaderId: uid, memberIds: [uid], invitedIds: [], createdAt: serverTimestamp(), ...data });

  test("anyone signed in can start one, as its only member and leader", async () => {
    await assertSucceeds(create("lead"));
  });

  test("can't start one for someone else, with others already in, or with invitations", async () => {
    await assertFails(create("lead", { leaderId: "ann" }));
    await assertFails(create("lead", { memberIds: ["lead", "ann"] }));
    await assertFails(create("lead", { invitedIds: ["ann"] }));
    await assertFails(setDoc(circle(signedOut(env)), { name: "x", leaderId: "lead", memberIds: ["lead"], invitedIds: [], createdAt: serverTimestamp() }));
  });

  test("a name of 1-40 characters, nothing extra, server time", async () => {
    await assertFails(create("lead", { name: "   " }));
    await assertFails(create("lead", { name: "x".repeat(41) }));
    await assertFails(create("lead", { extra: true }));
    await assertFails(create("lead", { createdAt: Timestamp.now() }));
  });
});

describe("who can see a circle", () => {
  test("members and invited people; nobody else", async () => {
    await seedCircle({ members: ["lead", "ann"], invited: ["ben"] });
    await assertSucceeds(getDoc(circle(as("ann"))));
    await assertSucceeds(getDoc(circle(as("ben"))));
    await assertFails(getDoc(circle(as("cat"))));
    await assertFails(getDoc(circle(signedOut(env))));
  });

  test("my circles and my invitations can be listed; not anyone else's", async () => {
    await seedCircle({ members: ["lead", "ann"], invited: ["ben"] });
    await assertSucceeds(getDocs(query(collection(as("ann"), "circles"), where("memberIds", "array-contains", "ann"))));
    await assertSucceeds(getDocs(query(collection(as("ben"), "circles"), where("invitedIds", "array-contains", "ben"))));
    await assertFails(getDocs(query(collection(as("cat"), "circles"), where("memberIds", "array-contains", "ann"))));
    await assertFails(getDocs(collection(as("ann"), "circles")));
  });
});

describe("inviting", () => {
  test("only the leader invites, one current friend at a time", async () => {
    await seedCircle();
    await seedFriends(env, "lead", "ann");
    await assertSucceeds(updateDoc(circle(as("lead")), { invitedIds: ["ann"] }));
  });

  test("not a stranger, not two at once, not someone already in, and not by a member", async () => {
    await seedCircle({ members: ["lead", "ann"] });
    await seedFriends(env, "lead", "ben");
    await seedFriends(env, "lead", "cat");
    await seedFriends(env, "ann", "dan");
    await assertFails(updateDoc(circle(as("lead")), { invitedIds: ["dan"] })); // not the leader's friend
    await assertFails(updateDoc(circle(as("lead")), { invitedIds: ["ben", "cat"] }));
    await assertFails(updateDoc(circle(as("lead")), { invitedIds: ["ann"] })); // already a member
    await assertFails(updateDoc(circle(as("ann")), { invitedIds: ["dan"] })); // members can't invite
  });

  test("at most 30 people, members and invitations together", async () => {
    const members = ["lead", ...Array.from({ length: 28 }, (_, i) => `m${i}`)];
    await seedCircle({ members, invited: ["ann"] });
    await seedFriends(env, "lead", "ben");
    await assertFails(updateDoc(circle(as("lead")), { invitedIds: ["ann", "ben"] }));
  });

  test("the leader can cancel an invitation", async () => {
    await seedCircle({ invited: ["ann", "ben"] });
    await assertSucceeds(updateDoc(circle(as("lead")), { invitedIds: ["ben"] }));
  });
});

describe("accepting, declining and leaving", () => {
  test("an invited person accepts and becomes a member", async () => {
    await seedCircle({ invited: ["ann"] });
    await assertSucceeds(updateDoc(circle(as("ann")), { invitedIds: arrayRemove("ann"), memberIds: arrayUnion("ann") }));
  });

  test("or declines", async () => {
    await seedCircle({ invited: ["ann"] });
    await assertSucceeds(updateDoc(circle(as("ann")), { invitedIds: arrayRemove("ann") }));
  });

  test("nobody joins without an invitation, or adds someone else", async () => {
    await seedCircle({ invited: ["ann"] });
    await assertFails(updateDoc(circle(as("ben")), { memberIds: arrayUnion("ben") }));
    await assertFails(updateDoc(circle(as("ann")), { invitedIds: arrayRemove("ann"), memberIds: arrayUnion("ann", "ben") }));
    await assertFails(updateDoc(circle(as("ann")), { invitedIds: arrayRemove("ann"), memberIds: ["ann"] }));
  });

  test("a member leaves; the leader can't leave (they delete the circle instead)", async () => {
    await seedCircle({ members: ["lead", "ann", "ben"] });
    await assertSucceeds(updateDoc(circle(as("ann")), { memberIds: arrayRemove("ann") }));
    await assertFails(updateDoc(circle(as("lead")), { memberIds: arrayRemove("lead") }));
    // A member can't remove someone else.
    await assertFails(updateDoc(circle(as("ben")), { memberIds: arrayRemove("lead") }));
  });

  test("the leader removes a member, renames, and deletes the circle", async () => {
    await seedCircle({ members: ["lead", "ann", "ben"] });
    await assertSucceeds(updateDoc(circle(as("lead")), { memberIds: arrayRemove("ann") }));
    await assertSucceeds(updateDoc(circle(as("lead")), { name: "Tuesday group" }));
    await assertFails(updateDoc(circle(as("ben")), { name: "Mine now" }));
    await assertFails(updateDoc(circle(as("lead")), { leaderId: "ben" }));
    await assertFails(deleteDoc(circle(as("ben"))));
    await assertSucceeds(deleteDoc(circle(as("lead"))));
  });
});

describe("the circle's prayer requests", () => {
  const add = (uid, data = {}) => setDoc(req(as(uid), `new_${uid}`), { authorId: uid, text: "Wisdom at work", createdAt: serverTimestamp(), prayedBy: [], ...data });

  test("members read and add them; invited people, former members and strangers can't", async () => {
    await seedCircle({ members: ["lead", "ann"], invited: ["ben"] });
    await seedRequest("lead");
    await assertSucceeds(getDoc(req(as("ann"))));
    await assertSucceeds(getDocs(collection(as("ann"), "circles", "c1", "circleRequests")));
    await assertSucceeds(add("ann"));
    await assertFails(getDoc(req(as("ben"))));
    await assertFails(add("ben"));
    await assertFails(getDoc(req(as("cat"))));
    // Ann leaves: her access ends at once.
    await assertSucceeds(updateDoc(circle(as("ann")), { memberIds: arrayRemove("ann") }));
    await assertFails(getDoc(req(as("ann"))));
  });

  test("a request is my own words, up to 300 characters, nobody prayed yet", async () => {
    await seedCircle({ members: ["lead", "ann"] });
    await assertFails(add("ann", { authorId: "lead" }));
    await assertFails(add("ann", { text: " " }));
    await assertFails(add("ann", { text: "x".repeat(301) }));
    await assertFails(add("ann", { prayedBy: ["lead"] }));
    await assertFails(add("ann", { extra: 1 }));
  });

  test("other members mark \"I prayed\" once (and undo); the author can't, nobody adds someone else", async () => {
    await seedCircle({ members: ["lead", "ann", "ben"] });
    await seedRequest("lead");
    await assertSucceeds(updateDoc(req(as("ann")), { prayedBy: arrayUnion("ann") }));
    await assertFails(updateDoc(req(as("ann")), { prayedBy: ["ann", "ann"] }));
    await assertFails(updateDoc(req(as("ben")), { prayedBy: ["ann", "ben", "lead"] }));
    await assertFails(updateDoc(req(as("lead")), { prayedBy: arrayUnion("lead") }));
    await assertFails(updateDoc(req(as("ben")), { prayedBy: [] })); // removing Ann
    await assertSucceeds(updateDoc(req(as("ann")), { prayedBy: arrayRemove("ann") }));
  });

  test("the author marks it answered (with an optional note) and undoes it; nobody else can", async () => {
    await seedCircle({ members: ["lead", "ann"] });
    await seedRequest("ann");
    await assertFails(updateDoc(req(as("lead")), { answeredAt: serverTimestamp() }));
    await assertFails(updateDoc(req(as("ann")), { answeredAt: serverTimestamp(), answerNote: "x".repeat(121) }));
    await assertFails(updateDoc(req(as("ann")), { answeredAt: Timestamp.now() }));
    await assertSucceeds(updateDoc(req(as("ann")), { answeredAt: serverTimestamp(), answerNote: "He's home!" }));
    // Answered: no new "I prayed".
    await assertFails(updateDoc(req(as("lead")), { prayedBy: arrayUnion("lead") }));
    await assertFails(updateDoc(req(as("ann")), { text: "Edited" }));
    await assertSucceeds(updateDoc(req(as("ann")), { answeredAt: deleteField(), answerNote: deleteField() }));
  });

  test("the author or the leader deletes one; other members can't", async () => {
    await seedCircle({ members: ["lead", "ann", "ben"] });
    await seedRequest("ann", {}, "r1");
    await seedRequest("ann", {}, "r2");
    await assertFails(deleteDoc(req(as("ben"), "r1")));
    await assertSucceeds(deleteDoc(req(as("ann"), "r1")));
    await assertSucceeds(deleteDoc(req(as("lead"), "r2")));
  });
});

describe("reporting a circle request", () => {
  const report = (uid, data = {}) =>
    setDoc(doc(as(uid), "reports", `rep_${uid}`), {
      reporter: uid, kind: "circleRequest", targetUid: "ann", circleId: "c1", requestId: "r1", reason: "harassment", createdAt: serverTimestamp(), ...data,
    });

  test("it says which circle and request; still write-only", async () => {
    await assertSucceeds(report("ben"));
    await assertFails(setDoc(doc(as("ben"), "reports", "rep_ben2"), {
      reporter: "ben", kind: "circleRequest", targetUid: "ann", circleId: "c1", reason: "harassment", createdAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(as("ben"), "reports", "rep_ben")));
  });
});
