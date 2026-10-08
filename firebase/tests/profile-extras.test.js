import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import {
  adminStorage, anonymousStorage, anonymousUser, clearBucket, seed, seedFollow, seedFriends, seedUser, setupEnv,
  signedInAs, signedOut, signedOutStorage, storageAs,
} from "./helpers.js";

// Cross-service (storage -> firestore) isn't involved here: avatar rules
// don't look at follows, so these run everywhere.
let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol"]) await seedUser(env, u);
});

const about = (db, uid = "alice") => doc(db, "users", uid, "friendsOnly", "about");
const user = (db, uid = "alice") => doc(db, "users", uid);

describe("bio: friends only", () => {
  beforeEach(async () => {
    await seed(env, (db) => setDoc(about(db), { bio: "Mum of two. Praying for my city." }));
  });

  test("owner can read and write their bio", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(getDoc(about(db)));
    await assertSucceeds(setDoc(about(db), { bio: "New bio" }));
    await assertSucceeds(setDoc(about(db), { bio: "" }));
  });

  test("a mutual friend can read it", async () => {
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(getDoc(about(signedInAs(env, "bob"))));
  });

  test("strangers, pending requests (either way) and friends of friends can't", async () => {
    await assertFails(getDoc(about(signedInAs(env, "carol"))));
    await seedFollow(env, "carol", "alice");
    await assertFails(getDoc(about(signedInAs(env, "carol"))));
    await seedFollow(env, "alice", "bob");
    await assertFails(getDoc(about(signedInAs(env, "bob"))));
    await seedFriends(env, "bob", "carol");
    await assertFails(getDoc(about(signedInAs(env, "carol"))));
  });

  test("a removed friend loses access on the next read", async () => {
    await seedFriends(env, "alice", "bob");
    const bob = signedInAs(env, "bob");
    await assertSucceeds(getDoc(about(bob)));
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    await assertFails(getDoc(about(bob)));
  });

  test("signed-out and anonymous users can't read it", async () => {
    await assertFails(getDoc(about(signedOut(env))));
    await assertFails(getDoc(about(anonymousUser(env, "x"))));
  });

  test("nobody else can write it, even a friend", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(setDoc(about(signedInAs(env, "bob")), { bio: "hacked" }));
  });

  test("160 characters max, only the known fields, nothing else in friendsOnly/", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(about(db), { bio: "x".repeat(160) }));
    await assertFails(setDoc(about(db), { bio: "x".repeat(161) }));
    await assertFails(setDoc(about(db), { bio: "hi", location: "Austin" }));
    await assertFails(setDoc(about(db), { bio: 42 }));
    await assertFails(setDoc(doc(db, "users", "alice", "friendsOnly", "other"), { bio: "hi" }));
  });

  test("can't be listed or deleted by clients", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(getDocs(collection(db, "users", "alice", "friendsOnly")));
    await assertFails(deleteDoc(about(db)));
  });

  test("the public profile never carries a bio", async () => {
    await assertFails(updateDoc(user(signedInAs(env, "alice")), { bio: "visible to strangers" }));
  });
});

describe("about details: birthday, hometown, prayer requests, Bible version, denomination, church", () => {
  const full = {
    bio: "Hi",
    birthday: "1990-03-14",
    hometown: "Lagos, Nigeria",
    prayerRequests: "My mum's health\nWisdom at work",
    requestIds: ["req1aaaaaa", "req2bbbbbb"],
    bibleVersion: "ESV",
    denomination: "Anglican",
    church: "St Mark's, Austin",
  };

  test("the owner can save any of them, each optional", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(about(db), full));
    await assertSucceeds(setDoc(about(db), { birthday: "03-14" }));
    await assertSucceeds(setDoc(about(db), { church: "Grace Church" }));
    await assertSucceeds(setDoc(about(db), {}));
  });

  test("they're friends-only, like the bio", async () => {
    await seed(env, (db) => setDoc(about(db), full));
    await assertFails(getDoc(about(signedInAs(env, "carol"))));
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(getDoc(about(signedInAs(env, "bob"))));
  });

  test("birthday is MM-DD or YYYY-MM-DD, a real month and day", async () => {
    const db = signedInAs(env, "alice");
    for (const ok of ["01-01", "12-31", "02-29", "2000-07-04"]) await assertSucceeds(setDoc(about(db), { birthday: ok }));
    for (const bad of ["13-01", "00-10", "04-32", "3-14", "March 14", "90-03-14", "2000-3-14", ""]) {
      await assertFails(setDoc(about(db), { birthday: bad }));
    }
  });

  test("length limits, and no empty strings (left out instead)", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(setDoc(about(db), { prayerRequests: "x".repeat(500), requestIds: ["req1aaaaaa"], bibleVersion: "x".repeat(40), denomination: "x".repeat(60), church: "x".repeat(80) }));
    await assertFails(setDoc(about(db), { prayerRequests: "x".repeat(501), requestIds: ["req1aaaaaa"] }));
    await assertFails(setDoc(about(db), { bibleVersion: "x".repeat(41) }));
    await assertFails(setDoc(about(db), { denomination: "x".repeat(61) }));
    await assertFails(setDoc(about(db), { church: "x".repeat(81) }));
    await assertSucceeds(setDoc(about(db), { hometown: "x".repeat(80) }));
    await assertFails(setDoc(about(db), { hometown: "x".repeat(81) }));
    await assertFails(setDoc(about(db), { hometown: "" }));
    await assertFails(setDoc(about(db), { church: "" }));
    await assertFails(setDoc(about(db), { church: 7 }));
  });

  test("a friend can't write them", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(setDoc(about(signedInAs(env, "bob")), { prayerRequests: "spam", requestIds: ["req1aaaaaa"] }));
  });
});

describe("prayer requests: one id per line", () => {
  const save = (data) => setDoc(about(signedInAs(env, "alice")), data);

  test("each line has an id, in the same order", async () => {
    await assertSucceeds(save({ prayerRequests: "One", requestIds: ["req1aaaaaa"] }));
    await assertSucceeds(save({ prayerRequests: "One\nTwo\nThree", requestIds: ["req1aaaaaa", "req2bbbbbb", "req3cccccc"] }));
  });

  test("ids are required with requests, and not allowed without", async () => {
    await assertFails(save({ prayerRequests: "One" }));
    await assertFails(save({ requestIds: ["req1aaaaaa"] }));
    await assertFails(save({ prayerRequests: "One", requestIds: [] }));
  });

  test("the number of ids must match the number of lines", async () => {
    await assertFails(save({ prayerRequests: "One\nTwo", requestIds: ["req1aaaaaa"] }));
    await assertFails(save({ prayerRequests: "One", requestIds: ["req1aaaaaa", "req2bbbbbb"] }));
  });

  test("at most 10, no repeats, and ids are short random tokens", async () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => `request${String(i).padStart(3, "0")}`);
    const lines = (n) => Array.from({ length: n }, (_, i) => `Line ${i}`).join("\n");
    await assertSucceeds(save({ prayerRequests: lines(10), requestIds: ids(10) }));
    await assertFails(save({ prayerRequests: lines(11), requestIds: ids(11) }));
    await assertFails(save({ prayerRequests: "One\nTwo", requestIds: ["req1aaaaaa", "req1aaaaaa"] }));
    await assertFails(save({ prayerRequests: "One", requestIds: ["short"] }));
    await assertFails(save({ prayerRequests: "One", requestIds: ["has_underscore1"] }));
    await assertFails(save({ prayerRequests: "One\nTwo", requestIds: ["req1aaaaaa,req2bbbbbb", "x"] }));
    await assertFails(save({ prayerRequests: "One", requestIds: [12345678] }));
    await assertFails(save({ prayerRequests: "One", requestIds: "req1aaaaaa" }));
  });
});

describe("profile photo path on the public profile", () => {
  test("owner can set, change and remove it", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(updateDoc(user(db), { avatarPath: "avatars/alice/a1.jpg" }));
    await assertSucceeds(updateDoc(user(db), { avatarPath: "avatars/alice/b2.jpg" }));
    await assertSucceeds(updateDoc(user(db), { avatarPath: deleteField() }));
  });

  test("must point into the owner's own avatars folder", async () => {
    const db = signedInAs(env, "alice");
    for (const bad of ["avatars/bob/a1.jpg", "postPhotos/alice/a1.jpg", "avatars/alice/../bob/a.jpg", "https://evil.example/x.jpg", 7]) {
      await assertFails(updateDoc(user(db), { avatarPath: bad }));
    }
  });

  test("nobody can change someone else's photo", async () => {
    await assertFails(updateDoc(user(signedInAs(env, "bob")), { avatarPath: "avatars/bob/a1.jpg" }));
  });

  test("display name edits still work alongside it; username still fixed", async () => {
    const db = signedInAs(env, "alice");
    await assertSucceeds(updateDoc(user(db), { displayName: "Alice P.", avatarPath: "avatars/alice/a1.jpg" }));
    await assertFails(updateDoc(user(db), { username: "newname" }));
  });
});

describe("avatar files in Storage", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const meta = { contentType: "image/jpeg" };
  const up = (s, path, bytes = JPEG, m = meta) => s.ref(path).put(bytes, m);

  // A fresh file name per test: a cleanup function still running from an
  // earlier test can't delete this test's file.
  let n = 0;
  let A1;
  beforeEach(async () => {
    await clearBucket(env);
    A1 = `avatars/alice/seeded${++n}.jpg`;
    await env.withSecurityRulesDisabled((ctx) => adminStorage(ctx).ref(A1).put(JPEG, meta));
  });

  test("any signed-in user can see a profile photo (decided: recognisable in requests)", async () => {
    await assertSucceeds(storageAs(env, "carol").ref(A1).getMetadata());
  });

  test("signed-out and anonymous users can't", async () => {
    await assertFails(signedOutStorage(env).ref(A1).getMetadata());
    await assertFails(anonymousStorage(env, "x").ref(A1).getMetadata());
  });

  test("only the owner uploads, as a JPEG under 2 MB with a plain name", async () => {
    await assertSucceeds(up(storageAs(env, "alice"), "avatars/alice/b2.jpg"));
    await assertFails(up(storageAs(env, "bob"), "avatars/alice/evil.jpg"));
    await assertFails(up(storageAs(env, "alice"), "avatars/alice/x.png", JPEG, { contentType: "image/png" }));
    await assertFails(up(storageAs(env, "alice"), "avatars/alice/big.jpg", new Uint8Array(2 * 1024 * 1024)));
    await assertFails(up(storageAs(env, "alice"), "avatars/alice/a b.jpg"));
  });

  test("only the owner deletes; nobody lists", async () => {
    await assertFails(storageAs(env, "bob").ref(A1).delete());
    await assertFails(storageAs(env, "alice").ref("avatars/alice").listAll());
    await assertSucceeds(storageAs(env, "alice").ref(A1).delete());
  });
});
