import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { follow, removeFriend } from "../src/lib/friends";
import { storageLoader } from "../src/lib/photoCache";
import { dbAs, seedUser, setupEnv, skipCrossService, storageAs } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const PATH = "postPhotos/alice/p1.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(PATH).put(JPEG, { contentType: "image/jpeg" });
  });
});

describe("storageLoader fetches bytes through the rules", () => {
  test("author gets their own photo", async () => {
    const bytes = await storageLoader(storageAs(env, "alice"))(PATH);
    expect(new Uint8Array(bytes)).toEqual(JPEG);
  });

  test("stranger is refused", async () => {
    await expect(storageLoader(storageAs(env, "bob"))(PATH)).rejects.toMatchObject({ code: "storage/unauthorized" });
  });

  test.skipIf(skipCrossService)("friend gets it, and is refused right after removal", async () => {
    await follow(dbAs(env, "alice"), "alice", "bob");
    await follow(dbAs(env, "bob"), "bob", "alice");
    const load = storageLoader(storageAs(env, "bob"));
    expect(new Uint8Array(await load(PATH))).toEqual(JPEG);
    await removeFriend(dbAs(env, "alice"), "alice", "bob");
    await expect(load(PATH)).rejects.toMatchObject({ code: "storage/unauthorized" });
  });
});
