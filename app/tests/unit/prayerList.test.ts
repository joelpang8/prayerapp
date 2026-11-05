import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { arrangeList, customGroups, itemProblem, prayedKey, prayedToday, todaysPicks } = await import("../../src/lib/prayerList");
const { buildExportHtml } = await import("../../src/lib/exportPrayers");
const { keysForAccount } = await import("../../src/lib/account");
type PrayerItem = import("../../src/lib/prayerList").PrayerItem;

let n = 0;
const item = (over: Partial<PrayerItem> = {}): PrayerItem => {
  n++;
  return { id: `i${String(n).padStart(3, "0")}`, name: `Person ${n}`, note: "", group: "family", often: "weekly", order: n, createdAt: new Date(2026, 0, 1, 0, n), answered: null, ...over };
};

/** Seven consecutive app days. */
const week = ["20261102", "20261103", "20261104", "20261105", "20261106", "20261107", "20261108"];

describe("Pray for today", () => {
  test("weekly ones come up exactly once a week, spread evenly; daily ones every day; answered never", () => {
    const weekly = Array.from({ length: 20 }, () => item());
    const daily = item({ often: "daily", name: "Mum" });
    const done = item({ often: "daily", answered: { at: new Date(), note: "" } });
    const all = [...weekly, daily, done];
    const seen = new Map<string, number>();
    for (const day of week) {
      const picks = todaysPicks(all, day);
      expect(picks[0].id).toBe(daily.id);
      expect(picks.some((p) => p.id === done.id)).toBe(false);
      const w = picks.filter((p) => p.often === "weekly");
      expect(w.length === 2 || w.length === 3).toBe(true);
      for (const p of w) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    }
    expect(seen.size).toBe(20);
    expect([...seen.values()].every((c) => c === 1)).toBe(true);
  });

  test("the same picks all day, and reordering the list doesn't change them", () => {
    const list = Array.from({ length: 10 }, () => item());
    const a = todaysPicks(list, "20261104").map((p) => p.id);
    const reordered = list.map((i, k) => ({ ...i, order: 100 - k }));
    expect(todaysPicks(reordered, "20261104").map((p) => p.id)).toEqual(a);
  });

  test("monthly ones come up once in 30 days", () => {
    const list = Array.from({ length: 30 }, () => item({ often: "monthly" }));
    const counts = new Map<string, number>();
    for (let d = 1; d <= 30; d++) {
      for (const p of todaysPicks(list, `202611${String(d).padStart(2, "0")}`)) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(30);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });

  test("✓ Prayed starts fresh each day and leaves with the account", () => {
    const stored = JSON.stringify({ day: "20261104", ids: ["a", "b"] });
    expect(prayedToday(stored, "20261104")).toEqual(["a", "b"]);
    expect(prayedToday(stored, "20261105")).toEqual([]);
    expect(prayedToday("not json", "20261104")).toEqual([]);
    expect(keysForAccount([prayedKey("me"), prayedKey("you")], "me")).toEqual([prayedKey("me")]);
  });
});

describe("the list", () => {
  test("preset groups first in their order, then mine A to Z; answered apart, newest first", () => {
    const a = item({ group: "Small group" });
    const b = item({ group: "world" });
    const c = item({ group: "family", order: 9 });
    const d = item({ group: "family", order: 1 });
    const e = item({ group: "Aunts" });
    const old = item({ answered: { at: new Date(2026, 1, 1), note: "" } });
    const recent = item({ answered: { at: new Date(2026, 5, 1), note: "Yes" } });
    const { groups, answered } = arrangeList([a, b, c, d, e, old, recent]);
    expect(groups.map((g) => g.group)).toEqual(["family", "world", "Aunts", "Small group"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([d.id, c.id]);
    expect(answered.map((i) => i.id)).toEqual([recent.id, old.id]);
    expect(customGroups([a, b, e])).toEqual(["Aunts", "Small group"]);
  });

  test("checks match the rules", () => {
    const ok = { name: "Mum", note: "", group: "family", often: "weekly" as const };
    expect(itemProblem(ok)).toBeNull();
    expect(itemProblem({ ...ok, name: "  " })).toBe("name");
    expect(itemProblem({ ...ok, name: "x".repeat(61) })).toBe("nameLong");
    expect(itemProblem({ ...ok, note: "x".repeat(201) })).toBe("noteLong");
    expect(itemProblem({ ...ok, group: "" })).toBe("group");
    const rules = readFileSync("../firebase/firestore.rules", "utf8");
    expect(rules).toContain("d.name.size() <= 60");
    expect(rules).toContain("d.note.size() <= 200");
    expect(rules).toContain("d.group.size() <= 30");
  });

  test("Download my prayers includes my list", () => {
    const html = buildExportHtml({
      name: "Sam", posts: [], photos: new Map(), verseText: new Map(), savedVerses: [], translation: "BSB", madeAt: new Date(),
      prayerList: [{ name: "Grandpa <Joe>", note: "Hip surgery", group: "Family", answeredAt: null, answerNote: "" }],
    });
    expect(html).toContain("Grandpa &lt;Joe&gt;");
    expect(html).toContain("Hip surgery");
  });

  test("it's on the Prayers tab", () => {
    expect(readFileSync("src/app/(tabs)/prayers.tsx", "utf8")).toContain("<PrayForToday />");
  });
});

describe("adding my own prayer requests to my list", () => {
  test("short requests become the name; long ones are cut at a word with the whole text as the note", async () => {
    const { entryFromRequest, requestOnList } = await import("../../src/lib/prayerList");
    expect(entryFromRequest("  Mum's   health ")).toEqual({ name: "Mum's health", note: "" });
    const long = "Wisdom for the big decision about moving our family to a new city and finding a church there";
    const e = entryFromRequest(long);
    expect(e.name.length).toBeLessThanOrEqual(60);
    expect(e.name.endsWith("…")).toBe(true);
    expect(long.startsWith(e.name.slice(0, -1))).toBe(true);
    expect(e.note).toBe(long);
    expect(requestOnList([item({ name: "mum's health" })], "Mum's health")).toBe(true);
    expect(requestOnList([item({ name: "Something else", note: long })], long)).toBe(true);
    expect(requestOnList([item({ name: "Dad" })], "Mum's health")).toBe(false);
  });

  test("the profile offers it and the add screen takes it", () => {
    expect(readFileSync("src/components/PrayerRequests.tsx", "utf8")).toContain('pathname: "/prayer-list/edit", params: entryFromRequest(r.text)');
    expect(readFileSync("src/app/prayer-list/edit.tsx", "utf8")).toContain("name: givenName");
  });
});
