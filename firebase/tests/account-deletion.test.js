import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { deleteAccountData, isRecentSignIn, RECENT_SIGN_IN_S } from "../functions/lib/accountDeletion.js";

// Runs the real deletion against the emulators with the Admin SDK (as the
// deleteAccount function does). Unique ids so other tests' triggers can't interfere.
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
const e2e = (name, fn) => test.skipIf(process.env.SKIP_CROSS_SERVICE === "1")(name, fn, 60000);

describe("signing in again before deleting (unit)", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  test("only within the last 5 minutes", () => {
    expect(isRecentSignIn(now / 1000 - 30, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 - RECENT_SIGN_IN_S, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 - RECENT_SIGN_IN_S - 1, now)).toBe(false);
    expect(isRecentSignIn(undefined, now)).toBe(false);
  });
});

describe("deleting an account", () => {
  let app;
  let db;
  let bucket;
  beforeAll(() => {
    app = initializeApp({ projectId: "demo-prayerapp", storageBucket: "demo-prayerapp.appspot.com" }, "deletion-test");
    db = getFirestore(app);
    bucket = getStorage(app).bucket();
  });
  afterAll(async () => { await deleteApp(app); });

  const t = Timestamp.now();
  const exists = async (path) => (await db.doc(path).get()).exists;

  e2e("removes everything of theirs and nothing of anyone else's", async () => {
    const me = "delme1";
    const keep = "keepme1";
    const other = "other1";
    // Profiles and usernames.
    for (const u of [me, keep, other]) {
      await db.doc(`users/${u}`).set({ username: u, displayName: u, createdAt: t });
      await db.doc(`usernames/${u}`).set({ uid: u });
    }
    await db.doc(`users/${me}/friendsOnly/about`).set({ bio: "hi", prayerRequests: "Mum", requestIds: ["reqmumhealth1"] });
    await db.doc(`users/${me}/private/settings`).set({ bibleVersion: "KJV" });
    await db.doc(`users/${me}/private/verseIndex`).set({ books: { PSA: 1 }, refs: { "PSA.145.18": 1 } });
    await db.doc(`users/${me}/savedVerses/PSA.46.10`).set({ verseRef: "PSA.46.10", savedAt: new Date() });
    await db.doc(`users/${me}/prayerList/item1`).set({ name: "Mum", note: "", group: "family", often: "weekly", order: 0, createdAt: new Date() });
    await db.doc(`users/${me}/starts/20261001`).set({ startedAt: new Date() });
    await db.doc(`users/${me}/hidden/post_x`).set({ createdAt: t });
    // Friendships and blocks, both ways.
    for (const [a, b] of [[me, keep], [keep, me], [me, other]]) await db.doc(`follows/${a}_${b}`).set({ followerId: a, followeeId: b, createdAt: t });
    await db.doc(`follows/${keep}_${other}`).set({ followerId: keep, followeeId: other, createdAt: t });
    await db.doc(`blocks/${me}_x9`).set({ blocker: me, blocked: "x9", createdAt: t });
    await db.doc(`blocks/x8_${me}`).set({ blocker: "x8", blocked: me, createdAt: t });
    // My posts (shared and private), with a friend's comment and reaction on them.
    const post = (author, id, extra = {}) => db.doc(`posts/${id}`).set({ authorId: author, promptId: id.split("_")[0], createdAt: t, notes: "n", visibility: "friends", photoPath: `postPhotos/${author}/${id.split("_")[0]}.jpg`, ...extra });
    await post(me, `20261001_${me}`);
    await post(me, `20261002_${me}`, { visibility: "private", photoPath: `privatePhotos/${me}/p.jpg` });
    await db.doc(`posts/20261001_${me}/comments/c1`).set({ authorId: keep, text: "amen", createdAt: t });
    await db.doc(`posts/20261001_${me}/reactions/${keep}`).set({ authorId: keep, kind: "praying", createdAt: t });
    // A friend's post, with my comment and reaction, and theirs.
    await post(keep, `20261001_${keep}`);
    await db.doc(`posts/20261001_${keep}/comments/mine`).set({ authorId: me, text: "praying", createdAt: t });
    await db.doc(`posts/20261001_${keep}/comments/theirs`).set({ authorId: keep, text: "thanks", createdAt: t });
    await db.doc(`posts/20261001_${keep}/reactions/${me}`).set({ authorId: me, kind: "hug", createdAt: t });
    // Taps: mine on their requests, theirs on mine, and someone else's on theirs.
    await db.doc(`users/${keep}/prayingFor/reqkeep1_${me}`).set({ friendUid: me, itemId: "reqkeep1", createdAt: t });
    await db.doc(`users/${keep}/prayingFor/reqkeep1_${other}`).set({ friendUid: other, itemId: "reqkeep1", createdAt: t });
    await db.doc(`users/${me}/prayingFor/reqmumhealth1_${keep}`).set({ friendUid: keep, itemId: "reqmumhealth1", createdAt: t });
    // Reports: one I filed, one about me.
    await db.doc("reports/r1").set({ reporter: me, kind: "user", targetUid: other, reason: "spam", createdAt: t });
    await db.doc("reports/r2").set({ reporter: other, kind: "comment", targetUid: me, postId: "p", commentId: "c", reason: "harassment", excerpt: "my words", createdAt: t });
    // Photos.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    for (const path of [`avatars/${me}/a.jpg`, `postPhotos/${me}/20261001.jpg`, `privatePhotos/${me}/p.jpg`, `postPhotos/${keep}/20261001.jpg`]) {
      await bucket.file(path).save(jpeg, { contentType: "image/jpeg" });
    }

    const deletedAuth = [];
    const summary = await deleteAccountData(me, {
      db,
      deleteFiles: (prefix) => bucket.deleteFiles({ prefix }),
      deleteAuthUser: async (uid) => { deletedAuth.push(uid); },
    });

    // Everything of mine is gone.
    for (const path of [
      `users/${me}`, `users/${me}/friendsOnly/about`, `users/${me}/private/settings`, `users/${me}/private/verseIndex`, `users/${me}/savedVerses/PSA.46.10`, `users/${me}/prayerList/item1`, `users/${me}/starts/20261001`,
      `users/${me}/hidden/post_x`, `users/${me}/prayingFor/reqmumhealth1_${keep}`, `usernames/${me}`,
      `posts/20261001_${me}`, `posts/20261002_${me}`, `posts/20261001_${me}/comments/c1`, `posts/20261001_${me}/reactions/${keep}`,
      `posts/20261001_${keep}/comments/mine`, `posts/20261001_${keep}/reactions/${me}`, `users/${keep}/prayingFor/reqkeep1_${me}`,
      `follows/${me}_${keep}`, `follows/${keep}_${me}`, `follows/${me}_${other}`, `blocks/${me}_x9`, `blocks/x8_${me}`, "reports/r1",
    ]) expect(await exists(path), path).toBe(false);
    for (const path of [`avatars/${me}/a.jpg`, `postPhotos/${me}/20261001.jpg`, `privatePhotos/${me}/p.jpg`]) {
      expect((await bucket.file(path).exists())[0], path).toBe(false);
    }
    expect(deletedAuth).toEqual([me]);

    // Nobody else's data is touched.
    for (const path of [
      `users/${keep}`, `usernames/${keep}`, `posts/20261001_${keep}`, `posts/20261001_${keep}/comments/theirs`,
      `users/${keep}/prayingFor/reqkeep1_${other}`, `follows/${keep}_${other}`,
    ]) expect(await exists(path), path).toBe(true);
    expect((await bucket.file(`postPhotos/${keep}/20261001.jpg`).exists())[0]).toBe(true);

    // A report about me stays for moderation, without my words.
    const r2 = (await db.doc("reports/r2").get()).data();
    expect(r2.excerpt).toBeUndefined();
    expect(r2).toMatchObject({ reporter: other, targetUid: me, reason: "harassment", excerptRemoved: "account deleted" });
    expect(summary).toMatchObject({ posts: 2, comments: 1, reactions: 1, tapsGiven: 1, follows: 3, blocks: 2, reportsFiled: 1 });

    // A late verse-index trigger from deleting my posts doesn't bring my profile data back.
    await new Promise((r) => setTimeout(r, 3000));
    expect(await exists(`users/${me}/private/verseIndex`)).toBe(false);
  });

  e2e("prayer circles: their requests, marks, invites and memberships go; others' stay; a circle they lead is handed on", async () => {
    const me = "circleme1";
    const ann = "circleann1";
    const ben = "circleben1";
    await db.doc(`users/${me}`).set({ username: me, displayName: me, createdAt: t });
    const circle = (id, leaderId, memberIds, invitedIds = []) => db.doc(`circles/${id}`).set({ name: id, leaderId, memberIds, invitedIds, createdAt: t });
    await circle("ledShared", me, [me, ann, ben]);
    await circle("ledAlone", me, [me]);
    await circle("member", ann, [ann, me]);
    await circle("invited", ben, [ben], [me, ann]);
    const request = (c, id, authorId, prayedBy = []) => db.doc(`circles/${c}/circleRequests/${id}`).set({ authorId, text: "t", createdAt: t, prayedBy });
    await request("member", "mine", me);
    await request("member", "anns", ann, [me]);
    await request("ledShared", "bens", ben, [me, ann]);
    await request("ledAlone", "lonely", me);
    await db.doc("circles/other/joinRequests/" + me).set({ uid: me, code: "c", createdAt: t });
    await db.doc("circles/other/joinRequests/" + ann).set({ uid: ann, code: "c", createdAt: t });
    await db.doc("circleLinks/alonelinkcode0000000000").set({ circleId: "ledAlone", name: "x", createdAt: t });
    await db.doc("circleLinks/sharedlinkcode000000000").set({ circleId: "ledShared", name: "x", createdAt: t });

    const deletedPrefixes = [];
    await deleteAccountData(me, { db, deleteFiles: async (p) => { deletedPrefixes.push(p); }, deleteAuthUser: async () => {} });

    // The photo of the circle that was deleted goes; the handed-on circle keeps its own.
    expect(deletedPrefixes).toContain("circlePhotos/ledAlone/");
    expect(deletedPrefixes).not.toContain("circlePhotos/ledShared/");
    expect(await exists("circles/member/circleRequests/mine")).toBe(false);
    expect((await db.doc("circles/member/circleRequests/anns").get()).get("prayedBy")).toEqual([]);
    expect((await db.doc("circles/ledShared/circleRequests/bens").get()).get("prayedBy")).toEqual([ann]);
    expect((await db.doc("circles/member").get()).get("memberIds")).toEqual([ann]);
    expect((await db.doc("circles/invited").get()).get("invitedIds")).toEqual([ann]);
    // The circle they led with others passes to the next member, requests intact.
    const led = (await db.doc("circles/ledShared").get()).data();
    expect(led).toMatchObject({ leaderId: ann, memberIds: [ann, ben] });
    expect(await exists("circles/ledShared/circleRequests/bens")).toBe(true);
    // The one they were alone in is gone, with its requests.
    expect(await exists("circles/ledAlone")).toBe(false);
    expect(await exists("circles/ledAlone/circleRequests/lonely")).toBe(false);
    // Their request to join another circle goes; someone else's stays.
    expect(await exists(`circles/other/joinRequests/${me}`)).toBe(false);
    expect(await exists(`circles/other/joinRequests/${ann}`)).toBe(true);
    // The deleted circle's invite link goes; the handed-on circle's stays.
    expect(await exists("circleLinks/alonelinkcode0000000000")).toBe(false);
    expect(await exists("circleLinks/sharedlinkcode000000000")).toBe(true);
  });

  e2e("deleting an account with nothing in it works too", async () => {
    const deletedAuth = [];
    await deleteAccountData("emptyuser1", { db, deleteFiles: (p) => bucket.deleteFiles({ prefix: p }), deleteAuthUser: async (u) => { deletedAuth.push(u); } });
    expect(deletedAuth).toEqual(["emptyuser1"]);
  });

  test("refuses a malformed uid", async () => {
    await expect(deleteAccountData("../x", { db, deleteFiles: async () => {}, deleteAuthUser: async () => {} })).rejects.toThrow();
  });
});
