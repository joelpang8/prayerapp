import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref } from "firebase/storage";
import { follow, removeFriend } from "../src/lib/friends";
import { aboutFields, EMPTY_ABOUT, getProfile, removeAvatar, saveAbout, setAvatar, watchAbout, type About, type AboutDoc } from "../src/lib/profile";
import type { Firestore } from "firebase/firestore";

const saveBio = (db: Firestore, uid: string, bio: string) => saveAbout(db, uid, { ...EMPTY_ABOUT, bio });
import { clearBucket, dbAs, seedUser, setupEnv, storageAs, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, 0xff, 0xd9]);

beforeEach(async () => {
  await env.clearFirestore();
  await clearBucket(env);
  for (const uid of ["alice", "bob", "carol"]) await seedUser(env, uid);
});

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

function watch(viewer: string, owner: string) {
  const state: { bio: string | null; about: AboutDoc | null; error: Error | null } = { bio: null, about: null, error: null };
  const stop = watchAbout(dbAs(env, viewer), owner, (a) => { state.bio = a.bio; state.about = a; }, (err) => { state.error = err; });
  return { state, stop };
}

describe("bio (friends only)", () => {
  test("is empty until written, then shows the trimmed text to its owner", async () => {
    const mine = watch("alice", "alice");
    try {
      await until(() => mine.state.bio === "");
      await saveBio(dbAs(env, "alice"), "alice", "  Grateful, always.  ");
      await until(() => mine.state.bio === "Grateful, always.");
    } finally {
      mine.stop();
    }
  });

  test("a friend can read it; a stranger is refused", async () => {
    await saveBio(dbAs(env, "alice"), "alice", "Hello friends");
    await befriend("alice", "bob");
    const friend = watch("bob", "alice");
    const stranger = watch("carol", "alice");
    try {
      await until(() => friend.state.bio === "Hello friends");
      await until(() => stranger.state.error !== null);
      expect(stranger.state.error).toMatchObject({ code: "permission-denied" });
      expect(stranger.state.bio).toBeNull();
    } finally {
      friend.stop();
      stranger.stop();
    }
  });

  test("a one-way follow (request not yet accepted) can't read it", async () => {
    await saveBio(dbAs(env, "alice"), "alice", "Hello");
    await follow(dbAs(env, "bob"), "bob", "alice");
    const pending = watch("bob", "alice");
    try {
      await until(() => pending.state.error !== null);
      expect(pending.state.bio).toBeNull();
    } finally {
      pending.stop();
    }
  });

  test("an unfriended viewer is refused on their next read", async () => {
    await saveBio(dbAs(env, "alice"), "alice", "Hello");
    await befriend("alice", "bob");
    await removeFriend(dbAs(env, "alice"), "alice", "bob");
    const after = watch("bob", "alice");
    try {
      await until(() => after.state.error !== null);
      expect(after.state.bio).toBeNull();
    } finally {
      after.stop();
    }
  });

  test("over 160 characters is refused before it's sent", async () => {
    await expect(saveBio(dbAs(env, "alice"), "alice", "x".repeat(161))).rejects.toThrow(/160/);
  });

  test("nobody can write someone else's bio", async () => {
    await befriend("alice", "bob");
    await expect(saveBio(dbAs(env, "bob"), "alice", "hijacked")).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("about details (friends only)", () => {
  const details: About = {
    bio: "Hi",
    birthday: "03-14",
    hometown: "Lagos, Nigeria",
    prayerRequests: "  Wisdom for a big decision.  ",
    bibleVersion: "ESV",
    denomination: "",
    church: "Grace Church, Austin",
  };

  test("saved together, trimmed, empty ones left out; a friend sees them, a stranger doesn't", async () => {
    await saveAbout(dbAs(env, "alice"), "alice", details);
    await befriend("alice", "bob");
    const friend = watch("bob", "alice");
    const stranger = watch("carol", "alice");
    try {
      await until(() => friend.state.about?.church === "Grace Church, Austin");
      expect(aboutFields(friend.state.about!)).toEqual({ ...details, prayerRequests: "Wisdom for a big decision." });
      expect(friend.state.about!.requests).toEqual([{ id: expect.stringMatching(/^[A-Za-z0-9]{20}$/), text: "Wisdom for a big decision." }]);
      await until(() => stranger.state.error !== null);
      expect(stranger.state.about).toBeNull();
    } finally {
      friend.stop();
      stranger.stop();
    }
  });

  test("saving again replaces the details (a cleared field goes away)", async () => {
    await saveAbout(dbAs(env, "alice"), "alice", details);
    await saveAbout(dbAs(env, "alice"), "alice", { ...details, church: "" });
    const mine = watch("alice", "alice");
    try {
      await until(() => mine.state.about !== null);
      expect(mine.state.about!.church).toBe("");
      expect(mine.state.about!.bibleVersion).toBe("ESV");
    } finally {
      mine.stop();
    }
  });

  test("an impossible birthday is refused before it's sent", async () => {
    await expect(saveAbout(dbAs(env, "alice"), "alice", { ...details, birthday: "04-31" })).rejects.toThrow(/real date/);
  });
});

describe("profile photo (any signed-in user)", () => {
  test("upload sets the profile's photo, which a stranger can load; remove clears it", async () => {
    const path = await setAvatar(dbAs(env, "alice"), storageAs(env, "alice"), "alice", JPEG, "a1");
    expect(path).toBe("avatars/alice/a1.jpg");
    expect((await getProfile(dbAs(env, "carol"), "alice"))?.avatarPath).toBe(path);
    const bytes = await getBytes(ref(storageAs(env, "carol"), path));
    expect(new Uint8Array(bytes)).toEqual(JPEG);

    await removeAvatar(dbAs(env, "alice"), "alice");
    expect((await getProfile(dbAs(env, "alice"), "alice"))?.avatarPath).toBeNull();
  });

  test("can't upload into someone else's folder", async () => {
    await expect(setAvatar(dbAs(env, "bob"), storageAs(env, "bob"), "alice", JPEG, "x1")).rejects.toMatchObject({ code: "storage/unauthorized" });
  });
});
