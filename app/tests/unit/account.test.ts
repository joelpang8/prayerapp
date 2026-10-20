import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

describe("delete my account (app side)", () => {
  test("only the exact word confirms, in any case, ignoring spaces", async () => {
    const { confirmed } = await import("../../src/lib/account");
    expect(confirmed("DELETE")).toBe(true);
    expect(confirmed(" delete ")).toBe(true);
    expect(confirmed("DELET")).toBe(false);
    expect(confirmed("")).toBe(false);
  });

  test("forgets this account's data on the phone, and only this account's", async () => {
    const { keysForAccount } = await import("../../src/lib/account");
    const keys = ["outbox.abc123", "activity.lastSeen.abc123", "outbox.zzz999", "ui.textSize", "ui.appearance", "notifications.enabled"];
    expect(keysForAccount(keys, "abc123").sort()).toEqual(["activity.lastSeen.abc123", "outbox.abc123"]);
  });

  test("calls the server function that does the deleting", () => {
    const src = readFileSync(new URL("../../src/lib/account.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../../../firebase/functions/src/index.ts", import.meta.url), "utf8");
    expect(src).toContain('httpsCallable(functions, "deleteAccount")');
    expect(server).toContain("export const deleteAccount = onCall(");
  });
});
