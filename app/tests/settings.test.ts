import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { setBibleVersion, watchSettings, type Settings } from "../src/lib/settings";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
});

test("defaults to KJV before anything is saved, then reflects the saved choice", async () => {
  const seen: Settings[] = [];
  const stop = watchSettings(dbAs(env, "alice"), "alice", (s) => seen.push(s));
  try {
    await until(() => seen.length > 0);
    expect(seen[0]).toEqual({ bibleVersion: "KJV" });
    await setBibleVersion(dbAs(env, "alice"), "alice", "KJV");
  } finally {
    stop();
  }
});

test("can't write a translation that isn't offered", async () => {
  await expect(setBibleVersion(dbAs(env, "alice"), "alice", "NIV" as never)).rejects.toMatchObject({ code: "permission-denied" });
});
