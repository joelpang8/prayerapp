import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { changeNotifyPrefs, newTopic, saveNotifyPrefs, watchNotifyPrefs, type NotifyPrefs } from "../src/lib/notifyPrefs";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
});

const random = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));

test("turning a notification on saves it under the real rules; nobody else can read it", async () => {
  const db = dbAs(env, "alice");
  let prefs: NotifyPrefs | null = null;
  const stop = watchNotifyPrefs(db, "alice", (p) => { prefs = p; });
  try {
    await saveNotifyPrefs(db, "alice", changeNotifyPrefs(null, "comments", true, "en", () => newTopic(random)));
    await until(() => prefs?.comments === true);
    expect(prefs!.taps).toBe(false);
  } finally {
    stop();
  }
  let refused = false;
  const stopBob = watchNotifyPrefs(dbAs(env, "bob"), "alice", (p) => { refused = p === null; });
  try {
    await until(() => refused);
  } finally {
    stopBob();
  }
});
