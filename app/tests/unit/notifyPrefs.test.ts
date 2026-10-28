import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { anyOn, changeNotifyPrefs, newTopic, parseNotifyPrefs, TOPIC_PATTERN } = await import("../../src/lib/notifyPrefs");
const { keysForAccount } = await import("../../src/lib/account");

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);

test("a new secret topic matches what the rules and server accept", () => {
  const topic = newTopic(bytes);
  expect(topic).toMatch(TOPIC_PATTERN);
  const rules = readFileSync("../firebase/firestore.rules", "utf8");
  expect(rules).toContain("d.topic.matches('^n_[A-Za-z0-9]{32}$')");
  expect(readFileSync("../firebase/functions/src/activityNotify.ts", "utf8")).toContain("/^n_[A-Za-z0-9]{32}$/");
});

test("all off until turned on; the topic is made once and kept", () => {
  const first = changeNotifyPrefs(null, "comments", true, "en", () => "n_" + "A".repeat(32));
  expect(first).toEqual({ topic: "n_" + "A".repeat(32), taps: false, reactions: false, comments: true, lang: "en" });
  const second = changeNotifyPrefs(first, "taps", true, "es", () => { throw new Error("no new topic"); });
  expect(second).toMatchObject({ topic: first.topic, taps: true, comments: true, lang: "es" });
  expect(anyOn(changeNotifyPrefs(second, "taps", false, "es", () => "") && { ...second, taps: false, comments: false })).toBe(false);
  expect(anyOn(null)).toBe(false);
  expect(parseNotifyPrefs({ topic: "prompt", taps: true })).toBeNull();
});

test("the phone forgets the account's topic with the account", () => {
  expect(keysForAccount(["activityTopic.abc", "activityTopic.xyz"], "abc")).toEqual(["activityTopic.abc"]);
});

test("tapping one opens the prayer (or my profile for prayer requests)", () => {
  const layout = readFileSync("src/app/(tabs)/_layout.tsx", "utf8");
  expect(layout).toContain('router.push(`/post/${data.postId}`)');
  expect(layout).toContain('router.navigate("/profile")');
  expect(layout).toContain("useActivitySubscription();");
});
