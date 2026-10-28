import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { seed, seedFriends, seedPrompt, seedUser, setupEnv, signedInAs, signedOut } from "./helpers.js";

// "Pray now" keeps you on time: users/{uid}/starts/{promptId}, and posts
// carrying its startedAt.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const PROMPT = "20261028";
const startRef = (db, uid = "alice", promptId = PROMPT) => doc(db, "users", uid, "starts", promptId);
const start = (uid = "alice", promptId = PROMPT) => setDoc(startRef(signedInAs(env, uid), uid, promptId), { startedAt: serverTimestamp() });
const firedAt = async () => {
  let t;
  await seed(env, async (db) => { t = (await getDoc(doc(db, "prompts", PROMPT))).data().firedAt; });
  return t;
};
const post = async (uid, extra = {}) =>
  setDoc(doc(signedInAs(env, uid), "posts", `${PROMPT}_${uid}`), {
    authorId: uid, promptId: PROMPT, promptFiredAt: await firedAt(), createdAt: serverTimestamp(),
    notes: "Praying for my sister", photoPath: `postPhotos/${uid}/abc123.jpg`, visibility: "friends", ...extra,
  });
const myStart = async (uid = "alice") => {
  let t;
  await seed(env, async (db) => { t = (await getDoc(startRef(db, uid))).data().startedAt; });
  return t;
};

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
});

describe("pressing Pray now", () => {
  test("within the first 7 minutes records the server's time", async () => {
    await seedPrompt(env, PROMPT, 3);
    await assertSucceeds(start());
    await assertSucceeds(getDoc(startRef(signedInAs(env, "alice"))));
  });

  test("not after the on-time window, not before the prompt, not for a missing prompt", async () => {
    await seedPrompt(env, PROMPT, 8);
    await assertFails(start());
    await seed(env, (db) => setDoc(doc(db, "prompts", "20261029"), { firedAt: Timestamp.fromMillis(Date.now() + 60_000) }));
    await assertFails(start("alice", "20261029"));
    await assertFails(start("alice", "20991231"));
  });

  test("only the server's time, only for myself, nothing else stored", async () => {
    await seedPrompt(env, PROMPT, 1);
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(startRef(db), { startedAt: Timestamp.fromMillis(Date.now() - 60_000) }));
    await assertFails(setDoc(startRef(db), { startedAt: serverTimestamp(), note: "x" }));
    await assertFails(setDoc(startRef(signedInAs(env, "bob"), "alice"), { startedAt: serverTimestamp() }));
    await assertFails(setDoc(startRef(signedOut(env), "alice"), { startedAt: serverTimestamp() }));
  });

  test("can't be moved later, only cancelled (deleted) by me", async () => {
    await seedPrompt(env, PROMPT, 1);
    await assertSucceeds(start());
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(startRef(db), { startedAt: serverTimestamp() }));
    await assertFails(deleteDoc(startRef(signedInAs(env, "bob"), "alice")));
    await assertSucceeds(deleteDoc(startRef(db)));
  });

  test("private: friends can't see when I started", async () => {
    await seedPrompt(env, PROMPT, 1);
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(start());
    await assertFails(getDoc(startRef(signedInAs(env, "bob"), "alice")));
  });
});

describe("posting after Pray now", () => {
  test("a post carrying my start time is accepted (on time, even after the window)", async () => {
    // Started 5 minutes after the prompt; posting 10 minutes after that.
    await seedPrompt(env, PROMPT, 15);
    await seed(env, (db) => setDoc(startRef(db), { startedAt: Timestamp.fromMillis(Date.now() - 10 * 60_000) }));
    await assertSucceeds(post("alice", { startedAt: await myStart() }));
  });

  test("not more than 15 minutes after starting", async () => {
    await seedPrompt(env, PROMPT, 20);
    await seed(env, (db) => setDoc(startRef(db), { startedAt: Timestamp.fromMillis(Date.now() - 16 * 60_000) }));
    await assertFails(post("alice", { startedAt: await myStart() }));
    // Without it, the post is still allowed: just late.
    await assertSucceeds(post("alice"));
  });

  test("must be exactly my recorded start; none without having pressed Pray now", async () => {
    await seedPrompt(env, PROMPT, 3);
    await assertFails(post("alice", { startedAt: Timestamp.now() }));
    await assertSucceeds(start());
    const real = await myStart();
    await assertFails(post("alice", { startedAt: Timestamp.fromMillis(real.toMillis() + 1000) }));
    await assertSucceeds(post("alice", { startedAt: real }));
  });

  test("someone else's start can't be used", async () => {
    await seedPrompt(env, PROMPT, 3);
    await assertSucceeds(start("bob"));
    let bobs;
    await seed(env, async (db) => { bobs = (await getDoc(startRef(db, "bob"))).data().startedAt; });
    await assertFails(post("alice", { startedAt: bobs }));
  });

  test("the start time can't be added or changed by editing", async () => {
    await seedPrompt(env, PROMPT, 3);
    await assertSucceeds(post("alice"));
    await assertSucceeds(start());
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(doc(db, "posts", `${PROMPT}_alice`), { startedAt: await myStart(), editedAt: serverTimestamp() }));
  });
});
