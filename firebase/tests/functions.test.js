import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { avatarOwner, isNotFound, ownedAvatarPath, ownedPhotoPath, postPhotoAuthor, revokeFileToken, revokeUserPhotoTokens } from "../functions/lib/photos.js";
import { clearBucket, seed, seedUser, setupEnv, signedInAs, storageAs } from "./helpers.js";

// These run against the Functions emulator (triggers fire for real).
// Same proxy caveat as the cross-service storage tests.
const e2e = (name, fn) => test.skipIf(process.env.SKIP_CROSS_SERVICE === "1")(name, fn, 30000);

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

async function eventually(check, timeoutMs = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`condition not met in ${timeoutMs}ms${last ? `: ${last}` : ""}`);
}

const errorCode = (promise) => promise.then(() => null, (err) => err.code);

describe("photo path ownership (unit)", () => {
  test("parses the author of a post photo path", () => {
    expect(postPhotoAuthor("postPhotos/alice/abc.jpg")).toBe("alice");
    expect(postPhotoAuthor("postPhotos/alice/../bob/abc.jpg")).toBeNull();
    expect(postPhotoAuthor("other/alice/abc.jpg")).toBeNull();
    expect(postPhotoAuthor(undefined)).toBeNull();
  });

  test("only a photo in the author's own folder is eligible for cleanup", () => {
    expect(ownedPhotoPath({ authorId: "alice", photoPath: "postPhotos/alice/a.jpg" })).toBe("postPhotos/alice/a.jpg");
    expect(ownedPhotoPath({ authorId: "alice", photoPath: "postPhotos/bob/a.jpg" })).toBeNull();
    // Private posts' photos are cleaned up the same way.
    expect(ownedPhotoPath({ authorId: "alice", photoPath: "privatePhotos/alice/a.jpg" })).toBe("privatePhotos/alice/a.jpg");
    expect(ownedPhotoPath({ authorId: "alice", photoPath: "privatePhotos/bob/a.jpg" })).toBeNull();
    expect(ownedPhotoPath({ authorId: "alice" })).toBeNull();
    expect(ownedPhotoPath(undefined)).toBeNull();
  });
});

describe("profile photo ownership (unit)", () => {
  test("parses and checks the owner of an avatar path", () => {
    expect(avatarOwner("avatars/alice/a1.jpg")).toBe("alice");
    expect(avatarOwner("avatars/alice/../bob/a.jpg")).toBeNull();
    expect(avatarOwner("postPhotos/alice/a1.jpg")).toBeNull();
    expect(ownedAvatarPath("alice", { avatarPath: "avatars/alice/a1.jpg" })).toBe("avatars/alice/a1.jpg");
    expect(ownedAvatarPath("alice", { avatarPath: "avatars/bob/a1.jpg" })).toBeNull();
    expect(ownedAvatarPath("alice", {})).toBeNull();
  });
});

describe("download-token revocation logic (unit)", () => {
  // The Storage emulator keeps tokens outside custom metadata and re-adds
  // them, so revocation can't be observed there. It's verified against the
  // real project with scripts/verify-production.mjs.
  function fakeFile(name, token = "tok") {
    const calls = [];
    return {
      name,
      metadata: { metadata: token ? { firebaseStorageDownloadTokens: token } : {} },
      setMetadata: async (m) => { calls.push(m); },
      calls,
    };
  }

  test("removes the token by setting the custom-metadata key to null", async () => {
    const f = fakeFile("postPhotos/alice/a.jpg");
    expect(await revokeFileToken(f)).toBe(true);
    expect(f.calls).toEqual([{ metadata: { firebaseStorageDownloadTokens: null } }]);
  });

  test("profile photos lose their token too", async () => {
    const f = fakeFile("avatars/alice/a1.jpg");
    expect(await revokeFileToken(f)).toBe(true);
  });

  test("leaves files without a token, and non-post files, alone", async () => {
    const none = fakeFile("postPhotos/alice/a.jpg", null);
    const other = fakeFile("somewhere/else.jpg");
    expect(await revokeFileToken(none)).toBe(false);
    expect(await revokeFileToken(other)).toBe(false);
    expect(none.calls).toEqual([]);
    expect(other.calls).toEqual([]);
  });

  test("revokes every tokened photo in one user's folder, and only that folder", async () => {
    const files = [fakeFile("postPhotos/alice/a.jpg"), fakeFile("postPhotos/alice/b.jpg"), fakeFile("postPhotos/alice/c.jpg", null)];
    const prefixes = [];
    const bucket = { getFiles: async ({ prefix }) => { prefixes.push(prefix); return [files]; } };
    expect(await revokeUserPhotoTokens(bucket, "alice")).toBe(2);
    expect(prefixes).toEqual(["postPhotos/alice/"]);
  });

  test("a photo deleted in the meantime is not an error", async () => {
    const gone = { ...fakeFile("postPhotos/alice/a.jpg"), setMetadata: async () => { throw Object.assign(new Error("No such object: b/postPhotos/alice/a.jpg"), { code: 404 }); } };
    expect(await revokeFileToken(gone)).toBe(false);
    const broken = { ...fakeFile("postPhotos/alice/a.jpg"), setMetadata: async () => { throw Object.assign(new Error("permission denied"), { code: 403 }); } };
    await expect(revokeFileToken(broken)).rejects.toThrow("permission denied");
    expect(isNotFound({ code: 404 })).toBe(true);
    expect(isNotFound({ code: 500, message: "boom" })).toBe(false);
  });

  test("a malformed uid never widens the prefix", async () => {
    const bucket = { getFiles: async () => { throw new Error("should not list"); } };
    expect(await revokeUserPhotoTokens(bucket, "")).toBe(0);
    expect(await revokeUserPhotoTokens(bucket, "../")).toBe(0);
    expect(await revokeUserPhotoTokens(bucket, "a/b")).toBe(0);
  });
});

describe("Cloud Functions against the emulators", () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await clearBucket(env);
    await seedUser(env, "alice");
  });

  e2e("deleting a post deletes its photo", async () => {
    const ref = storageAs(env, "alice").ref("postPhotos/alice/del1.jpg");
    await ref.put(JPEG, { contentType: "image/jpeg" });
    await seed(env, (db) => setDoc(doc(db, "posts", "20260929_alice"), {
      authorId: "alice", promptId: "20260929", promptFiredAt: Timestamp.now(), createdAt: Timestamp.now(),
      notes: "x", photoPath: "postPhotos/alice/del1.jpg",
    }));
    await deleteDoc(doc(signedInAs(env, "alice"), "posts", "20260929_alice"));
    await eventually(async () => (await errorCode(ref.getMetadata())) === "storage/object-not-found");
  });

  e2e("deleting a post deletes its comments and reactions", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "posts", "20260929_alice"), {
        authorId: "alice", promptId: "20260929", promptFiredAt: Timestamp.now(), createdAt: Timestamp.now(),
        notes: "x", photoPath: "postPhotos/alice/none.jpg",
      });
      await setDoc(doc(db, "posts", "20260929_alice", "comments", "c1"), { authorId: "bob", text: "amen", createdAt: Timestamp.now() });
      await setDoc(doc(db, "posts", "20260929_alice", "comments", "c2"), { authorId: "alice", text: "thanks", createdAt: Timestamp.now() });
      await setDoc(doc(db, "posts", "20260929_alice", "reactions", "bob"), { authorId: "bob", kind: "praying", createdAt: Timestamp.now() });
    });
    await deleteDoc(doc(signedInAs(env, "alice"), "posts", "20260929_alice"));
    await eventually(async () => {
      let left = 0;
      await env.withSecurityRulesDisabled(async (ctx) => {
        left = (await getDocs(collection(ctx.firestore(), "posts", "20260929_alice", "comments"))).size
          + (await getDocs(collection(ctx.firestore(), "posts", "20260929_alice", "reactions"))).size;
      });
      return left === 0;
    });
  });

  e2e("replacing a post's photo deletes the old one and keeps the new one", async () => {
    const storage = storageAs(env, "alice");
    const oldRef = storage.ref("postPhotos/alice/old1.jpg");
    const newRef = storage.ref("postPhotos/alice/new1.jpg");
    await oldRef.put(JPEG, { contentType: "image/jpeg" });
    await newRef.put(JPEG, { contentType: "image/jpeg" });
    await seed(env, (db) => setDoc(doc(db, "posts", "20260929_alice"), {
      authorId: "alice", promptId: "20260929", promptFiredAt: Timestamp.now(), createdAt: Timestamp.now(),
      notes: "x", photoPath: "postPhotos/alice/old1.jpg",
    }));
    await updateDoc(doc(signedInAs(env, "alice"), "posts", "20260929_alice"), {
      photoPath: "postPhotos/alice/new1.jpg", editedAt: serverTimestamp(),
    });
    await eventually(async () => (await errorCode(oldRef.getMetadata())) === "storage/object-not-found");
    await expect(newRef.getMetadata()).resolves.toBeTruthy();
  });

  e2e("changing a profile photo deletes the old one", async () => {
    const storage = storageAs(env, "alice");
    const oldRef = storage.ref("avatars/alice/old1.jpg");
    const newRef = storage.ref("avatars/alice/new1.jpg");
    await oldRef.put(JPEG, { contentType: "image/jpeg" });
    await newRef.put(JPEG, { contentType: "image/jpeg" });
    await seed(env, (db) => updateDoc(doc(db, "users", "alice"), { avatarPath: "avatars/alice/old1.jpg" }));
    await updateDoc(doc(signedInAs(env, "alice"), "users", "alice"), { avatarPath: "avatars/alice/new1.jpg" });
    await eventually(async () => (await errorCode(oldRef.getMetadata())) === "storage/object-not-found");
    await expect(newRef.getMetadata()).resolves.toBeTruthy();
  });
});
