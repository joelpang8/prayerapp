import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc } from "firebase/firestore";
import {
  anonymousStorage, seedFollow, seedFriends, seedUser, setupEnv, signedInAs, signedOutStorage, storageAs,
} from "./helpers.js";

// storage.rules calls firestore.exists(); in the Storage emulator that
// cross-service call breaks when HTTPS_PROXY is set (firebase-tools routes its
// own localhost request through the proxy). CI and local Macs are unaffected
// and must run these. SKIP_CROSS_SERVICE=1 is only for proxied sandboxes.
const crossService = test.skipIf(process.env.SKIP_CROSS_SERVICE === "1");

let env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const jpegMeta = { contentType: "image/jpeg" };
const photoPath = (author, id = "p1.jpg") => `postPhotos/${author}/${id}`;

// rules-unit-testing hands back compat Storage instances.
const upload = (storage, path, bytes = JPEG, meta = jpegMeta) => storage.ref(path).put(bytes, meta);
const fetchBytes = (storage, path) => storage.ref(path).getMetadata();
const download = (storage, path) => storage.ref(path).getDownloadURL();
const listDir = (storage, path) => storage.ref(path).listAll();

async function seedPhoto(author, id = "p1.jpg") {
  await env.withSecurityRulesDisabled((ctx) => ctx.storage().ref(photoPath(author, id)).put(JPEG, jpegMeta));
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  for (const u of ["alice", "bob", "carol"]) await seedUser(env, u);
  await seedPhoto("alice");
});

describe("uploading post photos", () => {
  test("author can upload a JPEG to their own folder", async () => {
    await assertSucceeds(upload(storageAs(env, "alice"), photoPath("alice", "new.jpg")));
  });

  test("author can replace a photo (post edit)", async () => {
    await assertSucceeds(upload(storageAs(env, "alice"), photoPath("alice")));
  });

  test("cannot upload into someone else's folder", async () => {
    await assertFails(upload(storageAs(env, "bob"), photoPath("alice", "evil.jpg")));
  });

  test("cannot overwrite someone else's photo", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(upload(storageAs(env, "bob"), photoPath("alice")));
  });

  test("non-JPEG content type rejected", async () => {
    await assertFails(upload(storageAs(env, "alice"), photoPath("alice", "x.jpg"), JPEG, { contentType: "text/html" }));
  });

  test("bad file names rejected", async () => {
    const s = storageAs(env, "alice");
    await assertFails(upload(s, photoPath("alice", "x.html")));
    await assertFails(upload(s, photoPath("alice", "a b.jpg")));
    await assertFails(upload(s, "postPhotos/alice/nested/x.jpg"));
  });

  test("files of 5 MB or more rejected", async () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    await assertFails(upload(storageAs(env, "alice"), photoPath("alice", "big.jpg"), big));
  });

  test("anonymous and signed-out users cannot upload", async () => {
    await assertFails(upload(anonymousStorage(env, "alice"), photoPath("alice", "a.jpg")));
    await assertFails(upload(signedOutStorage(env), photoPath("alice", "a.jpg")));
  });

  test("nothing outside postPhotos/ is writable", async () => {
    await assertFails(upload(storageAs(env, "alice"), "alice/p.jpg"));
    await assertFails(upload(storageAs(env, "alice"), "public/p.jpg"));
  });
});

describe("reading post photos", () => {
  test("author can read own photo", async () => {
    await assertSucceeds(fetchBytes(storageAs(env, "alice"), photoPath("alice")));
  });

  crossService("mutual friend can read", async () => {
    await seedFriends(env, "alice", "bob");
    await assertSucceeds(fetchBytes(storageAs(env, "bob"), photoPath("alice")));
  });

  test("stranger cannot read", async () => {
    await assertFails(fetchBytes(storageAs(env, "carol"), photoPath("alice")));
  });

  test("one-way follow cannot read, in either direction", async () => {
    await seedFollow(env, "bob", "alice");
    await assertFails(fetchBytes(storageAs(env, "bob"), photoPath("alice")));
    await seedPhoto("bob");
    await assertFails(fetchBytes(storageAs(env, "alice"), photoPath("bob")));
  });

  test("friend of a friend cannot read", async () => {
    await seedFriends(env, "alice", "bob");
    await seedFriends(env, "bob", "carol");
    await assertFails(fetchBytes(storageAs(env, "carol"), photoPath("alice")));
  });

  crossService("access ends the moment the friendship ends", async () => {
    await seedFriends(env, "alice", "bob");
    const bob = storageAs(env, "bob");
    await assertSucceeds(fetchBytes(bob, photoPath("alice")));
    await deleteDoc(doc(signedInAs(env, "alice"), "follows", "alice_bob"));
    await assertFails(fetchBytes(bob, photoPath("alice")));
  });

  test("signed-out and anonymous users cannot read", async () => {
    await assertFails(fetchBytes(signedOutStorage(env), photoPath("alice")));
    await assertFails(fetchBytes(anonymousStorage(env, "x"), photoPath("alice")));
  });

  test("folders cannot be listed, even by the author", async () => {
    await assertFails(listDir(storageAs(env, "alice"), "postPhotos/alice"));
    await assertFails(listDir(storageAs(env, "alice"), "postPhotos"));
  });
});

describe("deleting post photos", () => {
  test("author can delete", async () => {
    await assertSucceeds(storageAs(env, "alice").ref(photoPath("alice")).delete());
  });

  test("friend cannot delete", async () => {
    await seedFriends(env, "alice", "bob");
    await assertFails(storageAs(env, "bob").ref(photoPath("alice")).delete());
  });
});
