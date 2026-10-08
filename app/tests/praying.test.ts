import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { follow, removeFriend } from "../src/lib/friends";
import { FriendScope } from "../src/lib/friendScope";
import { MyPrayersFor, prayFor, prayingByRequest, PrayingForMe, stopPraying, type PrayerTap } from "../src/lib/praying";
import { EMPTY_ABOUT, saveAbout, watchAbout, type AboutDoc } from "../src/lib/profile";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

async function aliceRequests(): Promise<AboutDoc> {
  let about: AboutDoc | null = null;
  const stop = watchAbout(dbAs(env, "alice"), "alice", (a) => { about = a; });
  await until(() => !!about && about.requests.length > 0);
  stop();
  return about!;
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob", "carol", "dave"]) await seedUser(env, u);
  await befriend("alice", "bob");
  await befriend("alice", "carol");
  await saveAbout(dbAs(env, "alice"), "alice", { ...EMPTY_ABOUT, prayerRequests: "Mum's health\nWisdom at work" });
});

function openOwner() {
  const scope = new FriendScope(dbAs(env, "alice"), "alice");
  const errors: Error[] = [];
  const store = new PrayingForMe(dbAs(env, "alice"), scope, (e) => errors.push(e));
  let taps: PrayerTap[] = [];
  scope.start();
  store.start();
  store.subscribe((t) => { taps = t; });
  return { scope, errors, get: () => taps, stop: () => { store.stop(); scope.stop(); } };
}

async function openFriend(uid: string, owner = "alice") {
  const scope = new FriendScope(dbAs(env, uid), uid);
  scope.start();
  await until(() => scope.isLoaded);
  const errors: Error[] = [];
  const store = new MyPrayersFor(dbAs(env, uid), scope, owner, (e) => errors.push(e));
  let taps: PrayerTap[] = [];
  store.start();
  store.subscribe((t) => { taps = t; });
  return { scope, errors, get: () => taps, stop: () => { store.stop(); scope.stop(); } };
}

describe("I'll pray for this, against the real rules", () => {
  test("friends tap and undo; the owner sees a live count per request", async () => {
    const { requests } = await aliceRequests();
    const [mum, work] = requests.map((r) => r.id!);
    const alice = openOwner();
    const bob = await openFriend("bob");
    try {
      await prayFor(dbAs(env, "bob"), "alice", "bob", mum);
      await prayFor(dbAs(env, "carol"), "alice", "carol", mum);
      await prayFor(dbAs(env, "carol"), "alice", "carol", work);
      await until(() => alice.get().length === 3);
      const by = prayingByRequest(alice.get(), requests, (u) => alice.scope.isFriend(u));
      expect(by.get(mum)!.sort()).toEqual(["bob", "carol"]);
      expect(by.get(work)).toEqual(["carol"]);

      // Bob sees only his own tap, so his button shows "Praying".
      await until(() => bob.get().length === 1);
      expect(bob.get()).toEqual([{ friendUid: "bob", itemId: mum }]);

      await stopPraying(dbAs(env, "bob"), "alice", "bob", mum);
      await until(() => alice.get().length === 2 && bob.get().length === 0);
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      alice.stop();
      bob.stop();
    }
  });

  test("a stranger can't tap and their store never starts; you can't tap your own", async () => {
    const [mum] = (await aliceRequests()).requests.map((r) => r.id!);
    await expect(prayFor(dbAs(env, "dave"), "alice", "dave", mum)).rejects.toBeTruthy();
    await expect(prayFor(dbAs(env, "alice"), "alice", "alice", mum)).rejects.toBeTruthy();
    const dave = await openFriend("dave");
    try {
      await new Promise((r) => setTimeout(r, 300));
      expect(dave.get()).toEqual([]);
      expect(dave.errors).toEqual([]);
    } finally {
      dave.stop();
    }
  });

  test("unfriending drops their taps from the owner's memory at once, and stops the friend's view", async () => {
    const [mum] = (await aliceRequests()).requests.map((r) => r.id!);
    await prayFor(dbAs(env, "bob"), "alice", "bob", mum);
    const alice = openOwner();
    const bob = await openFriend("bob");
    try {
      await until(() => alice.get().length === 1 && bob.get().length === 1);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      // Gone from memory without waiting for the server or a Cloud Function.
      await until(() => alice.get().length === 0 && bob.get().length === 0);
      await expect(prayFor(dbAs(env, "bob"), "alice", "bob", mum)).rejects.toBeTruthy();
    } finally {
      alice.stop();
      bob.stop();
    }
  });

  test("rewording a request gives it a new id (its count starts again); unchanged ones keep theirs", async () => {
    const before = await aliceRequests();
    const [mum, work] = before.requests.map((r) => r.id!);
    await saveAbout(dbAs(env, "alice"), "alice", { ...EMPTY_ABOUT, prayerRequests: "Mum's health\nWisdom at my new job" }, before);
    let after: AboutDoc | null = null;
    const stop = watchAbout(dbAs(env, "alice"), "alice", (a) => { after = a; });
    await until(() => !!after && after.requests[1]?.text === "Wisdom at my new job");
    stop();
    expect(after!.requests[0].id).toBe(mum);
    expect(after!.requests[1].id).not.toBe(work);
    // The old id can't be tapped any more.
    await expect(prayFor(dbAs(env, "bob"), "alice", "bob", work)).rejects.toBeTruthy();
    await prayFor(dbAs(env, "bob"), "alice", "bob", after!.requests[1].id!);
  });
});
