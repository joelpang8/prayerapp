import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { BirthdayStore, isBirthdayOn } from "../src/lib/birthdays";
import { follow, removeFriend } from "../src/lib/friends";
import { FriendScope } from "../src/lib/friendScope";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

const today = new Date(2026, 9, 20); // 20 October 2026, the phone's day
const about = (uid: string, birthday: string) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", uid, "friendsOnly", "about"), { bio: "", birthday }));

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["bob", "alice", "carol", "dave"]) await seedUser(env, u);
  await about("alice", "1990-10-20");
  await about("carol", "10-21");
  await about("dave", "10-20");
});

function start(uid: string) {
  const scope = new FriendScope(dbAs(env, uid), uid);
  const store = new BirthdayStore(dbAs(env, uid), scope);
  store.start();
  scope.start();
  return { scope, store, stop: () => { store.stop(); scope.stop(); } };
}

describe("friends' birthdays on Today", () => {
  test("only current friends, only today's", async () => {
    await befriend("bob", "alice");
    await befriend("bob", "carol");
    await follow(dbAs(env, "dave"), "dave", "bob"); // dave isn't a friend: never read or shown
    const s = start("bob");
    try {
      await until(() => s.store.today(today).length === 1);
      expect(s.store.today(today)).toEqual(["alice"]);
    } finally {
      s.stop();
    }
  });

  test("a removed friend's birthday disappears at once", async () => {
    await befriend("bob", "alice");
    const s = start("bob");
    try {
      await until(() => s.store.today(today).length === 1);
      await removeFriend(dbAs(env, "alice"), "alice", "bob");
      await until(() => s.store.today(today).length === 0);
    } finally {
      s.stop();
    }
  });
});

test("29 February birthdays are on the 28th in other years", () => {
  expect(isBirthdayOn("02-29", new Date(2027, 1, 28))).toBe(true);
  expect(isBirthdayOn("02-29", new Date(2028, 1, 28))).toBe(false);
  expect(isBirthdayOn("02-29", new Date(2028, 1, 29))).toBe(true);
  expect(isBirthdayOn("10-20", new Date(2026, 9, 20))).toBe(true);
  expect(isBirthdayOn("10-20", new Date(2026, 9, 21))).toBe(false);
});
