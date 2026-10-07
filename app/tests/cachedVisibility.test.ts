import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection, connectFirestoreEmulator, getDocsFromCache, initializeFirestore, onSnapshot, query, where,
} from "firebase/firestore";
import { follow, removeFriend } from "../src/lib/friends";
import { FriendScope } from "../src/lib/friendScope";
import { firestoreSettings } from "../src/lib/firestoreSettings";
import { PhotoCache } from "../src/lib/photoCache";
import { dbAs, PROJECT_ID, seedPost, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
  await follow(dbAs(env, "alice"), "alice", "bob");
  await follow(dbAs(env, "bob"), "bob", "alice");
  await seedPost(env, "alicePost", "alice");
});

describe("the app's Firestore cache settings", () => {
  let app: FirebaseApp;
  afterAll(async () => { if (app) await deleteApp(app); });

  test("a friend's posts leave the SDK cache as soon as their listener is torn down", async () => {
    // Same settings the app uses (src/firebase.ts), signed in as bob.
    app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo" }, "cache-test");
    const db = initializeFirestore(app, firestoreSettings);
    connectFirestoreEmulator(db, "127.0.0.1", 8080, {
      mockUserToken: { sub: "bob", firebase: { sign_in_provider: "apple.com" } } as never,
    });
    const alicePosts = query(collection(db, "posts"), where("authorId", "==", "alice"), where("visibility", "==", "friends"));

    let seen = 0;
    const unsub = onSnapshot(alicePosts, (s) => { if (!s.metadata.fromCache) seen = s.size; });
    await until(() => seen === 1);
    expect((await getDocsFromCache(alicePosts)).size).toBe(1);

    unsub();
    // Eager GC: nothing of alice's is left on the device to read offline.
    expect((await getDocsFromCache(alicePosts)).size).toBe(0);
  });
});

describe("FriendScope end to end", () => {
  test("when alice removes bob, bob's device drops alice's photos without waiting for a failed read", async () => {
    const scope = new FriendScope(dbAs(env, "bob"), "bob");
    const photos = new PhotoCache(async (p) => new TextEncoder().encode(p).buffer as ArrayBuffer);
    scope.register(photos);
    scope.start();
    try {
      await until(() => scope.isFriend("alice"));
      await photos.get("postPhotos/alice/p1.jpg");
      expect(photos.size).toBe(1);

      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => !scope.isFriend("alice"));
      expect(photos.peek("postPhotos/alice/p1.jpg")).toBeUndefined();
    } finally {
      scope.stop();
    }
  });
});
