import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc,
} from "firebase/firestore";
import { seed, seedFriends, seedPrompt, seedUser, setupEnv, signedInAs } from "./helpers.js";

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const PROMPT = "20260929";
let firedAt;

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
  await seedPrompt(env, PROMPT, 1);
  await seed(env, async (db) => { firedAt = (await getDoc(doc(db, "prompts", PROMPT))).data().firedAt; });
});

const postRef = (db, uid, promptId = PROMPT) => doc(db, "posts", `${promptId}_${uid}`);

function newPost(uid, overrides = {}) {
  return {
    authorId: uid,
    promptId: PROMPT,
    promptFiredAt: firedAt,
    createdAt: serverTimestamp(),
    notes: "Praying for my sister's surgery",
    photoPath: `postPhotos/${uid}/abc123.jpg`,
    ...overrides,
  };
}

const create = (uid, overrides, db = signedInAs(env, uid)) =>
  setDoc(postRef(db, overrides?.authorId ?? uid, overrides?.promptId), newPost(uid, overrides));

describe("creating a post", () => {
  test("author can answer a prompt that has fired", async () => {
    await assertSucceeds(create("alice"));
  });

  test("cannot post as someone else", async () => {
    await assertFails(setDoc(postRef(signedInAs(env, "bob"), "alice"), newPost("alice")));
    await assertFails(setDoc(postRef(signedInAs(env, "bob"), "bob"), newPost("bob", { authorId: "alice" })));
  });

  test("one post per user per prompt: doc id must be {promptId}_{uid}", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(setDoc(doc(db, "posts", "random"), newPost("alice")));
    await assertSucceeds(create("alice"));
    // A second create on the same id is an update, which must carry editedAt.
    await assertFails(setDoc(postRef(db, "alice"), newPost("alice", { notes: "again" })));
  });

  test("prompt must exist and must have fired already", async () => {
    await assertFails(create("alice", { promptId: "20991231" }));
    await seed(env, (db) => setDoc(doc(db, "prompts", "20260930"), {
      firedAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
    }));
    await assertFails(create("alice", { promptId: "20260930" }));
  });

  test("a prompt closes 24 hours after it fired", async () => {
    await seedPrompt(env, "20260901", 24 * 60 + 1);
    await assertFails(create("alice", { promptId: "20260901" }));
    await seedPrompt(env, "20260902", 23 * 60);
    let fired;
    await seed(env, async (db) => { fired = (await getDoc(doc(db, "prompts", "20260902"))).data().firedAt; });
    await assertSucceeds(create("alice", { promptId: "20260902", promptFiredAt: fired }));
  });

  test("timing fields can't be faked (this is what keeps 'late' honest)", async () => {
    await assertFails(create("alice", { createdAt: firedAt }));
    await assertFails(create("alice", { promptFiredAt: Timestamp.now() }));
  });

  test("notes are required and bounded", async () => {
    await assertFails(create("alice", { notes: "" }));
    await assertFails(create("alice", { notes: "x".repeat(2001) }));
    await assertFails(create("alice", { notes: 42 }));
    await assertSucceeds(create("alice", { notes: "x".repeat(2000) }));
  });

  test("photo must be in the author's own folder", async () => {
    await assertFails(create("alice", { photoPath: "postPhotos/bob/abc123.jpg" }));
    await assertFails(create("alice", { photoPath: "postPhotos/alice/../bob/x.jpg" }));
    await assertFails(create("alice", { photoPath: "https://example.com/x.jpg" }));
  });

  test("no extra fields (e.g. a self-awarded 'onTime' flag or early editedAt)", async () => {
    await assertFails(create("alice", { onTime: true }));
    await assertFails(create("alice", { editedAt: serverTimestamp() }));
  });

  test("user without a profile can't post", async () => {
    await assertFails(create("ghost"));
  });

  test("prompts are read-only for clients", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(doc(db, "prompts", PROMPT)));
    await assertFails(setDoc(doc(db, "prompts", "20261001"), { firedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "prompts", PROMPT), { firedAt: serverTimestamp() }));
  });
});

describe("editing a post", () => {
  beforeEach(async () => { await assertSucceeds(create("alice")); });

  test("author can edit notes and photo; editedAt must be server time", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(updateDoc(postRef(db, "alice"), { notes: "Update: surgery went well", editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(postRef(db, "alice"), { photoPath: "postPhotos/alice/def456.jpg", editedAt: serverTimestamp() }));
    const snap = await getDoc(postRef(db, "alice"));
    expect(snap.data().editedAt).toBeInstanceOf(Timestamp);
  });

  test("an edit without editedAt is rejected (the 'edited' indicator can't be skipped)", async () => {
    await assertFails(updateDoc(postRef(signedInAs(env, "alice"), "alice"), { notes: "sneaky" }));
  });

  test("editedAt can't be backdated or removed", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(postRef(db, "alice"), { notes: "x", editedAt: Timestamp.fromMillis(0) }));
    await assertSucceeds(updateDoc(postRef(db, "alice"), { notes: "x", editedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db, "alice"), { editedAt: deleteField() }));
  });

  test("timing and identity fields are immutable", async () => {
    const db = signedInAs(env, "alice");
    for (const change of [
      { createdAt: firedAt },
      { promptFiredAt: Timestamp.now() },
      { promptId: "20260101" },
      { authorId: "bob" },
    ]) {
      await assertFails(updateDoc(postRef(db, "alice"), { ...change, editedAt: serverTimestamp() }));
    }
  });

  test("edited notes and photo are validated like on create", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(updateDoc(postRef(db, "alice"), { notes: "", editedAt: serverTimestamp() }));
    await assertFails(updateDoc(postRef(db, "alice"), { photoPath: "postPhotos/bob/x.jpg", editedAt: serverTimestamp() }));
  });

  test("friends can't edit someone else's post", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(updateDoc(postRef(signedInAs(env, "bob"), "alice"), { notes: "hi", editedAt: serverTimestamp() }));
  });
});

describe("deleting a post", () => {
  beforeEach(async () => { await assertSucceeds(create("alice")); });

  test("author can delete", async () => {
    await assertSucceeds(deleteDoc(postRef(signedInAs(env, "alice"), "alice")));
  });

  test("friend can't delete", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(deleteDoc(postRef(signedInAs(env, "bob"), "alice")));
  });
});

describe("verse reference carried from the prompt", () => {
  const VERSE_PROMPT = "20261001";
  let verseFiredAt;

  beforeEach(async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "prompts", VERSE_PROMPT), {
        firedAt: Timestamp.fromMillis(Date.now() - 60_000),
        verseRef: "PHP.4.6-7",
      });
      verseFiredAt = (await getDoc(doc(db, "prompts", VERSE_PROMPT))).data().firedAt;
    });
  });

  const withVerse = (overrides = {}) =>
    create("alice", { promptId: VERSE_PROMPT, promptFiredAt: verseFiredAt, verseRef: "PHP.4.6-7", ...overrides });

  test("post carries the prompt's verse reference", async () => {
    await assertSucceeds(withVerse());
  });

  test("a different verse is rejected", async () => {
    await assertFails(withVerse({ verseRef: "JHN.3.16" }));
  });

  test("leaving it off when the prompt has one is rejected", async () => {
    const post = newPost("alice", { promptId: VERSE_PROMPT, promptFiredAt: verseFiredAt });
    await assertFails(setDoc(postRef(signedInAs(env, "alice"), "alice", VERSE_PROMPT), post));
  });

  test("adding one when the prompt has none is rejected", async () => {
    await assertFails(create("alice", { verseRef: "PHP.4.6-7" }));
  });

  test("verse text can't be smuggled in instead of a reference", async () => {
    await assertFails(withVerse({ verseRef: "Be careful for nothing; but in every thing by prayer..." }));
    await assertFails(withVerse({ verseText: "Be careful for nothing" }));
  });

  test("the verse reference can't be changed by an edit", async () => {
    await assertSucceeds(withVerse());
    const ref = postRef(signedInAs(env, "alice"), "alice", VERSE_PROMPT);
    await assertFails(updateDoc(ref, { verseRef: "JHN.3.16", editedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { verseRef: deleteField(), editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { notes: "edited notes", editedAt: serverTimestamp() }));
  });
});
