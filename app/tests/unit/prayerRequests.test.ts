import { describe, expect, test } from "vitest";
import { assignRequestIds, joinRequests, requestItems, splitRequests } from "../../src/lib/prayerRequests";
import { prayingByRequest, prayingCountText, prayingNamesText } from "../../src/lib/praying";
import { aboutProblem, EMPTY_ABOUT } from "../../src/lib/profile";

describe("prayer requests, one per line", () => {
  test("lines are trimmed and blank ones dropped", () => {
    expect(splitRequests("  Mum's health \r\n\n Wisdom at work\n  ")).toEqual(["Mum's health", "Wisdom at work"]);
    expect(joinRequests(["A", "B"])).toBe("A\nB");
  });

  test("stored text and ids pair up; misaligned (older) ids are ignored", () => {
    expect(requestItems("A\nB", ["idaaaaaaaa", "idbbbbbbbb"])).toEqual([{ id: "idaaaaaaaa", text: "A" }, { id: "idbbbbbbbb", text: "B" }]);
    expect(requestItems("A; B and C", [])).toEqual([{ id: null, text: "A; B and C" }]);
    expect(requestItems("A\nB", ["idaaaaaaaa"])).toEqual([{ id: null, text: "A" }, { id: null, text: "B" }]);
  });

  test("an unchanged line keeps its id (and count); a reworded or new one gets a new id", () => {
    let n = 0;
    const newId = () => `newid${String(++n).padStart(5, "0")}`;
    const before = [{ id: "mumhealth1", text: "Mum's health" }, { id: "workwisdom", text: "Wisdom at work" }];
    expect(assignRequestIds(before, ["Wisdom at work", "Mum's health", "A new job"], newId)).toEqual(["workwisdom", "mumhealth1", "newid00001"]);
    expect(assignRequestIds(before, ["Mum's health is better", "Wisdom at work"], newId)).toEqual(["newid00002", "workwisdom"]);
  });

  test("the same text twice doesn't share an id", () => {
    let n = 0;
    const newId = () => `newid${String(++n).padStart(5, "0")}`;
    expect(assignRequestIds([{ id: "sameidsame", text: "Peace" }], ["Peace", "Peace"], newId)).toEqual(["sameidsame", "newid00001"]);
  });

  test("lines from before ids existed all get new ids", () => {
    expect(assignRequestIds([{ id: null, text: "A" }], ["A"], () => "freshidxxx")).toEqual(["freshidxxx"]);
  });

  test("at most 10", () => {
    const lines = (k: number) => Array.from({ length: k }, (_, i) => `Request ${i}`).join("\n");
    expect(aboutProblem({ ...EMPTY_ABOUT, prayerRequests: lines(10) })).toBeNull();
    expect(aboutProblem({ ...EMPTY_ABOUT, prayerRequests: lines(11) })).toMatch(/10/);
  });
});

describe("who's praying (the owner's view)", () => {
  const requests = [{ id: "reqa", text: "A" }, { id: "reqb", text: "B" }, { id: null, text: "old" }];
  const friends = new Set(["bob", "carol"]);

  test("counts only current friends, on current requests, once each", () => {
    const taps = [
      { friendUid: "bob", itemId: "reqa" },
      { friendUid: "carol", itemId: "reqa" },
      { friendUid: "dave", itemId: "reqa" }, // not a friend any more
      { friendUid: "bob", itemId: "reqgone" }, // request removed
      { friendUid: "bob", itemId: "reqa" }, // duplicate
    ];
    const by = prayingByRequest(taps, requests, (u) => friends.has(u));
    expect(by.get("reqa")).toEqual(["bob", "carol"]);
    expect(by.get("reqb")).toEqual([]);
    expect(by.has("reqgone")).toBe(false);
  });

  test("gentle wording", () => {
    expect(prayingCountText(1)).toBe("1 friend is praying for this");
    expect(prayingCountText(3)).toBe("3 friends are praying for this");
    expect(prayingNamesText(["Ana"])).toBe("Ana is praying for this");
    expect(prayingNamesText(["Ana", "Ben"])).toBe("Ana and Ben are praying for this");
    expect(prayingNamesText(["Ana", "Ben", "Cy"])).toBe("Ana, Ben and Cy are praying for this");
  });
});

describe("the bullet-list editor", () => {
  test("starts with one row per request, or one empty row", async () => {
    const { editorRows } = await import("../../src/lib/prayerRequests");
    expect(editorRows("Mum's health\nWisdom at work")).toEqual(["Mum's health", "Wisdom at work"]);
    expect(editorRows("")).toEqual([""]);
    expect(editorRows("  \n a \n\n")).toEqual(["a"]);
  });

  test("a pasted line break stays in one request", async () => {
    const { cleanRow } = await import("../../src/lib/prayerRequests");
    expect(cleanRow("Mum's\nhealth")).toBe("Mum's health");
    expect(cleanRow("a \r\n  b")).toBe("a b");
  });

  test("adds a row only under the limit and when none is empty", async () => {
    const { canAddRow, MAX_REQUESTS } = await import("../../src/lib/prayerRequests");
    expect(canAddRow(["a"])).toBe(true);
    expect(canAddRow(["a", " "])).toBe(false);
    expect(canAddRow(Array.from({ length: MAX_REQUESTS - 1 }, (_, i) => `r${i}`))).toBe(true);
    expect(canAddRow(Array.from({ length: MAX_REQUESTS }, (_, i) => `r${i}`))).toBe(false);
  });

  test("saves as one request per line, blank rows dropped, ids kept for unchanged requests", async () => {
    const { joinRequests, splitRequests, assignRequestIds } = await import("../../src/lib/prayerRequests");
    const edited = joinRequests(["Mum's health", "", "Wisdom at work", " "]);
    const lines = splitRequests(edited);
    expect(joinRequests(lines)).toBe("Mum's health\nWisdom at work");
    let n = 0;
    const ids = assignRequestIds([{ id: "reqmumhealth1", text: "Mum's health" }], lines, () => `newid000${++n}`);
    expect(ids).toEqual(["reqmumhealth1", "newid0001"]);
  });
});

test("blank rows left in the editor don't count toward the limits", () => {
  const text = ["x".repeat(495), ...Array(12).fill("")].join("\n");
  expect(aboutProblem({ ...EMPTY_ABOUT, prayerRequests: text })).toBeNull();
});
