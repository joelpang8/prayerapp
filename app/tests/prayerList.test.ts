import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addItem, removeItem, setAnswered, swapOrder, watchPrayerList, type PrayerItem } from "../src/lib/prayerList";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedUser(env, "alice");
  await seedUser(env, "bob");
});

test("my prayer list works under the real rules, and nobody else can read it", async () => {
  const db = dbAs(env, "alice");
  let items: PrayerItem[] = [];
  const stop = watchPrayerList(db, "alice", (x) => { items = x; });
  try {
    await addItem(db, "alice", { name: " Mum ", note: "Surgery", group: "family", often: "daily" }, items);
    await until(() => items.length === 1);
    await addItem(db, "alice", { name: "Our church", note: "", group: "Small group", often: "weekly" }, items);
    await until(() => items.length === 2);
    expect(items.find((i) => i.name === "Mum")).toMatchObject({ note: "Surgery", group: "family", often: "daily", order: 0 });
    const [a, b] = [...items].sort((x, y) => x.order - y.order);
    await swapOrder(db, "alice", a, b);
    await until(() => items.find((i) => i.id === a.id)?.order === b.order);
    await setAnswered(db, "alice", a.id, true, "Home and well");
    await until(() => items.find((i) => i.id === a.id)?.answered?.note === "Home and well");
    await setAnswered(db, "alice", a.id, false);
    await until(() => items.find((i) => i.id === a.id)?.answered === null);
    await removeItem(db, "alice", b.id);
    await until(() => items.length === 1);
  } finally {
    stop();
  }
  let refused = false;
  const stopBob = watchPrayerList(dbAs(env, "bob"), "alice", () => {}, () => { refused = true; });
  try {
    await until(() => refused);
  } finally {
    stopBob();
  }
});
