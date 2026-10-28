import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { collection, doc, getDocs, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { buildActivityMessage, parseNotifyPrefs, shouldNotify } from "../functions/lib/activityNotify.js";
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
});
