import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { collection, doc, getDocs, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { buildActivityMessage, buildCircleMessage, parseNotifyPrefs, shouldNotify, shouldNotifyCircle } from "../functions/lib/activityNotify.js";
import { seed, seedFriends, seedUser, setupEnv, signedInAs } from "./helpers.js";

// Opt-in notifications about my own things. Unit tests for the wording and
// who gets told; end-to-end runs against the Functions emulator, which
// records a dry run (no FCM there) in _notifyDryRun.
const e2e = (name, fn) => test.skipIf(process.env.SKIP_CROSS_SERVICE === "1")(name, fn, 60000);

const TOPIC = "n_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
const prefs = (over = {}) => ({ topic: TOPIC, taps: true, reactions: true, comments: true, lang: "en", ...over });

describe("wording and who gets told (unit)", () => {
  test("off unless turned on; never about myself; a bad topic means nothing is sent", () => {
    const p = parseNotifyPrefs(prefs({ reactions: false }));
    expect(shouldNotify(p, "taps", "alice", "bob")).toBe(true);
    expect(shouldNotify(p, "reactions", "alice", "bob")).toBe(false);
    expect(shouldNotify(p, "comments", "alice", "alice")).toBe(false);
    expect(parseNotifyPrefs(prefs({ topic: "prompt" }))).toBeNull();
    expect(shouldNotify(null, "taps", "alice", "bob")).toBe(false);
  });

  test("names the friend; English and Spanish", () => {
    const en = buildActivityMessage(parseNotifyPrefs(prefs()), { kind: "taps", name: "Sarah", requestText: "Mum's health" });
    expect(en.notification).toEqual({ title: "🙏 Sarah is praying for you", body: "For: “Mum's health”" });
    expect(en.topic).toBe(TOPIC);
    const es = buildActivityMessage(parseNotifyPrefs(prefs({ lang: "es" })), { kind: "comments", name: "Sarah", text: "Amén", postId: "p1" });
    expect(es.notification).toEqual({ title: "💬 Sarah comentó tu oración", body: "“Amén”" });
    expect(es.data).toEqual({ kind: "activity", activity: "comments", postId: "p1" });
    const r = buildActivityMessage(parseNotifyPrefs(prefs()), { kind: "reactions", name: "Sarah", reaction: "amen", postId: "p1", notes: "x".repeat(300) });
    expect(r.notification.title).toBe("🙌 Sarah reacted to your prayer");
    expect(r.notification.body.length).toBeLessThanOrEqual(100);
  });
});

describe("friend requests (unit)", () => {
  test("off until turned on; names who asked; tapping opens Activity", () => {
    expect(shouldNotify(parseNotifyPrefs(prefs()), "requests", "alice", "bob")).toBe(false);
    const p = parseNotifyPrefs(prefs({ requests: true }));
    expect(shouldNotify(p, "requests", "alice", "bob")).toBe(true);
    const en = buildActivityMessage(p, { kind: "requests", name: "Sarah" });
    expect(en.notification).toEqual({ title: "👋 Sarah wants to be friends", body: "Open PrayAlong to accept or decline." });
    expect(en.data).toEqual({ kind: "activity", activity: "requests" });
    const es = buildActivityMessage(parseNotifyPrefs(prefs({ requests: true, lang: "es" })), { kind: "requests", name: "Sarah" });
    expect(es.notification.title).toBe("👋 Sarah quiere ser tu amigo");
  });
});

describe("prayer circles (unit)", () => {
  test("only the circles I turned on, never about my own requests", () => {
    const p = parseNotifyPrefs(prefs({ circles: ["c1"] }));
    expect(shouldNotifyCircle(p, "c1", "alice", "bob")).toBe(true);
    expect(shouldNotifyCircle(p, "c2", "alice", "bob")).toBe(false);
    expect(shouldNotifyCircle(p, "c1", "alice", "alice")).toBe(false);
    expect(shouldNotifyCircle(parseNotifyPrefs(prefs()), "c1", "alice", "bob")).toBe(false);
    expect(shouldNotifyCircle(null, "c1", "alice", "bob")).toBe(false);
  });

  test("wording for a new request and an answered one; tapping opens the circle", () => {
    const en = buildCircleMessage(parseNotifyPrefs(prefs({ circles: ["c1"] })), { kind: "new", circleId: "c1", circleName: "Small group", name: "Grace", text: "Job interview" });
    expect(en.notification).toEqual({ title: "🙏 New request in Small group", body: "Grace: “Job interview”" });
    expect(en.data).toEqual({ kind: "activity", activity: "circle", circleId: "c1" });
    const es = buildCircleMessage(parseNotifyPrefs(prefs({ lang: "es" })), { kind: "answered", circleId: "c1", circleName: "Grupo", name: "Grace", text: "Trabajo", note: "¡Me lo dieron!" });
    expect(es.notification).toEqual({ title: "✦ La petición de Grace fue respondida (Grupo)", body: "¡Me lo dieron!" });
  });
});

describe("sent when a friend acts (emulators)", () => {
  let env;
  beforeAll(async () => { env = await setupEnv(); });
  afterAll(async () => { await env.cleanup(); });

  const PROMPT = "20261028";
  beforeEach(async () => {
    await env.clearFirestore();
    await seedUser(env, "alice");
    await seedUser(env, "bob");
    await seedFriends(env, "alice", "bob");
    await seed(env, async (db) => {
      await setDoc(doc(db, "prompts", PROMPT), { firedAt: Timestamp.fromMillis(Date.now() - 60_000) });
      await setDoc(doc(db, "posts", `${PROMPT}_alice`), {
        authorId: "alice", promptId: PROMPT, promptFiredAt: Timestamp.fromMillis(Date.now() - 60_000), createdAt: Timestamp.now(),
        notes: "For Mum's surgery", photoPath: "postPhotos/alice/p.jpg", visibility: "friends",
      });
      await setDoc(doc(db, "users", "alice", "friendsOnly", "about"), { bio: "", prayerRequests: "Mum's health", requestIds: ["reqmumhealth1"] });
    });
  });

  async function sent(owner) {
    let out = [];
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      await seed(env, async (db) => { out = (await getDocs(collection(db, "_notifyDryRun"))).docs.map((d) => d.data()).filter((d) => d.owner === owner); });
      if (out.length) return out;
      await new Promise((r) => setTimeout(r, 300));
    }
    return out;
  }

  e2e("a comment, a reaction and a prayer tap each notify the owner who opted in", async () => {
    await seed(env, (db) => setDoc(doc(db, "users", "alice", "private", "notify"), prefs()));
    const bob = signedInAs(env, "bob");
    await setDoc(doc(bob, "posts", `${PROMPT}_alice`, "comments", "c1"), { authorId: "bob", text: "Praying with you", createdAt: serverTimestamp() });
    await setDoc(doc(bob, "posts", `${PROMPT}_alice`, "reactions", "bob"), { authorId: "bob", kind: "amen", createdAt: serverTimestamp() });
    await setDoc(doc(bob, "users", "alice", "prayingFor", "reqmumhealth1_bob"), { friendUid: "bob", itemId: "reqmumhealth1", createdAt: serverTimestamp() });
    let got = [];
    const until = Date.now() + 25000;
    while (got.length < 3 && Date.now() < until) got = await sent("alice");
    const titles = got.map((g) => g.message.notification.title).sort();
    expect(titles).toEqual(["💬 bob commented on your prayer", "🙌 bob reacted to your prayer", "🙏 bob is praying for you"]);
    expect(got.every((g) => g.message.topic === TOPIC)).toBe(true);
  });

  e2e("nothing when the owner hasn't opted in", async () => {
    const bob = signedInAs(env, "bob");
    await setDoc(doc(bob, "posts", `${PROMPT}_alice`, "comments", "c1"), { authorId: "bob", text: "Hi", createdAt: serverTimestamp() });
    await new Promise((r) => setTimeout(r, 4000));
    let all = [];
    await seed(env, async (db) => { all = (await getDocs(collection(db, "_notifyDryRun"))).docs; });
    expect(all).toHaveLength(0);
  });

  e2e("a new or answered circle request tells members who turned it on for that circle, not the author or someone who blocked them", async () => {
    await seedUser(env, "cat");
    await seed(env, async (db) => {
      await setDoc(doc(db, "circles", "c1"), { name: "Small group", leaderId: "alice", memberIds: ["alice", "bob", "cat"], invitedIds: [], createdAt: Timestamp.now() });
      await setDoc(doc(db, "users", "alice", "private", "notify"), prefs({ circles: ["c1"] }));
      await setDoc(doc(db, "users", "bob", "private", "notify"), prefs({ topic: "n_" + "b".repeat(32), circles: ["c1"] }));
      await setDoc(doc(db, "users", "cat", "private", "notify"), prefs({ topic: "n_" + "c".repeat(32), circles: ["c1"] }));
      await setDoc(doc(db, "blocks", "cat_bob"), { blocker: "cat", blocked: "bob", createdAt: Timestamp.now() });
    });
    const bob = signedInAs(env, "bob");
    await setDoc(doc(bob, "circles", "c1", "circleRequests", "r1"), { authorId: "bob", text: "Job interview", createdAt: serverTimestamp(), prayedBy: [] });
    const got = await sent("alice");
    expect(got.map((g) => g.message.notification.title)).toEqual(["🙏 New request in Small group"]);
    expect(got[0].message.data).toEqual({ kind: "activity", activity: "circle", circleId: "c1" });
    await new Promise((r) => setTimeout(r, 2500));
    let others = [];
    await seed(env, async (db) => { others = (await getDocs(collection(db, "_notifyDryRun"))).docs.map((d) => d.data().owner).filter((o) => o !== "alice"); });
    expect(others).toEqual([]);
  });

  e2e("a friend request notifies only if turned on, never from someone blocked, and not when accepting", async () => {
    await seedUser(env, "cat");
    await seedUser(env, "dan");
    await seed(env, async (db) => {
      await setDoc(doc(db, "users", "cat", "private", "notify"), prefs({ topic: "n_" + "c".repeat(32), requests: true }));
      await setDoc(doc(db, "blocks", "cat_dan"), { blocker: "cat", blocked: "dan", createdAt: Timestamp.now() });
    });
    await setDoc(doc(signedInAs(env, "bob"), "follows", "bob_cat"), { followerId: "bob", followeeId: "cat", createdAt: serverTimestamp() });
    await setDoc(doc(signedInAs(env, "dan"), "follows", "dan_cat"), { followerId: "dan", followeeId: "cat", createdAt: serverTimestamp() });
    const got = await sent("cat");
    expect(got.map((g) => g.message.notification.title)).toEqual(["👋 bob wants to be friends"]);
    // Cat accepting Bob's request doesn't notify Bob (and Bob hasn't turned it on anyway).
    await new Promise((r) => setTimeout(r, 2500));
    let all = [];
    await seed(env, async (db) => { all = (await getDocs(collection(db, "_notifyDryRun"))).docs.map((d) => d.data().owner); });
    expect(all).toEqual(["cat"]);
  });
});
