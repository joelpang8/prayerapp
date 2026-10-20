import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { planReminder, REMINDER_AFTER_MS } = await import("../../src/lib/reminder");

const firedAt = new Date("2026-10-20T19:14:00Z");
const prompt = { id: "20261020", firedAt };
const base = { enabled: true, prompt, posted: false, now: firedAt.getTime() + 60_000 };

describe("remind me if I haven't prayed", () => {
  test("30 minutes after the prompt, if I haven't posted", () => {
    expect(planReminder(base)).toEqual({ kind: "schedule", at: firedAt.getTime() + REMINDER_AFTER_MS, promptId: "20261020" });
    expect(REMINDER_AFTER_MS).toBe(30 * 60_000);
  });

  test("never when off, after posting, without a prompt, or once it's past", () => {
    expect(planReminder({ ...base, enabled: false })).toEqual({ kind: "cancel" });
    expect(planReminder({ ...base, posted: true })).toEqual({ kind: "cancel" });
    expect(planReminder({ ...base, prompt: null })).toEqual({ kind: "cancel" });
    expect(planReminder({ ...base, now: firedAt.getTime() + REMINDER_AFTER_MS })).toEqual({ kind: "cancel" });
  });

  test("off by default, scheduled only from a prompt that has fired, never sent to the server", () => {
    const lib = readFileSync("src/lib/reminder.ts", "utf8");
    expect(lib).toMatch(/let enabled = false;/);
    expect(lib).not.toMatch(/firebase|promptSchedule/);
    const hook = readFileSync("src/session/useReminder.ts", "utf8");
    expect(hook).toContain("useLatestPrompt()");
    expect(hook).not.toMatch(/promptSchedule/);
  });
});
