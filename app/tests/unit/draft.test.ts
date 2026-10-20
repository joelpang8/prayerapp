import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { draftKey, parseDraft } = await import("../../src/lib/draft");
const { keysForAccount } = await import("../../src/lib/account");

describe("a half-written prayer", () => {
  test("comes back only for the same day's prompt", () => {
    const raw = JSON.stringify({ promptId: "20261020", notes: "For Mum's surgery" });
    expect(parseDraft(raw, "20261020")).toBe("For Mum's surgery");
    expect(parseDraft(raw, "20261021")).toBeNull();
    expect(parseDraft(JSON.stringify({ promptId: "20261020", notes: "   " }), "20261020")).toBeNull();
    expect(parseDraft("{broken", "20261020")).toBeNull();
    expect(parseDraft(null, "20261020")).toBeNull();
  });

  test("is removed with the account, and only that account's", () => {
    expect(keysForAccount([draftKey("abc"), draftKey("xyz")], "abc")).toEqual([draftKey("abc")]);
  });

  test("leaving with unsaved words asks first; posting clears the draft", () => {
    const compose = readFileSync("src/app/compose.tsx", "utf8");
    expect(compose).toContain("usePreventRemove(unsaved && !leaving && !busy");
    expect(compose).toMatch(/if \(!editing\) void clearDraft\(uid\);\s*(haptics\.done\(\);\s*)?setLeaving\(true\);/);
    // Only the words are kept, never the photo.
    expect(readFileSync("src/lib/draft.ts", "utf8")).not.toMatch(/photo(Uri|Id)/);
  });
});
