import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { saveVerse, unsaveVerse, watchSavedVerses, type SavedVerse } from "../src/lib/savedVerses";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
});

describe("saved verses against the real rules", () => {
  test("save, list newest first, unsave", async () => {
    const db = dbAs(env, "alice");
    let verses: SavedVerse[] | null = null;
    const stop = watchSavedVerses(db, "alice", (v) => { verses = v; });
    try {
      await saveVerse(db, "alice", "PSA.46.10");
      await until(() => verses?.length === 1);
      await new Promise((r) => setTimeout(r, 20));
      await saveVerse(db, "alice", "PHP.4.6-7");
      await until(() => verses?.length === 2 && verses.every((v) => v.savedAt));
      expect(verses!.map((v) => v.refId)).toEqual(["PHP.4.6-7", "PSA.46.10"]);
      await unsaveVerse(db, "alice", "PSA.46.10");
      await until(() => verses?.length === 1);
    } finally {
      stop();
    }
  });

  test("a friend can't see my list", async () => {
    await saveVerse(dbAs(env, "alice"), "alice", "PSA.46.10");
    let failed = false;
    const stop = watchSavedVerses(dbAs(env, "bob"), "alice", () => {}, () => { failed = true; });
    try {
      await until(() => failed);
    } finally {
      stop();
    }
  });

  test("only real references", () => {
    expect(() => saveVerse(dbAs(env, "alice"), "alice", "psalm 46")).toThrow();
  });
});
