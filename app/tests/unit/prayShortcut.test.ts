import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { OPEN_FOR_MS, prayNowTarget } from "../../src/lib/prayShortcut";

const firedAt = new Date("2026-10-29T18:00:00Z");
const at = (ms: number) => firedAt.getTime() + ms;

describe("Pray now from the app icon or prayerapp://pray", () => {
  test("opens the posting screen while today's prompt is open and I haven't posted", () => {
    expect(prayNowTarget({ prompt: { firedAt }, posted: false, now: at(60_000) })).toBe("/compose");
    expect(prayNowTarget({ prompt: { firedAt }, posted: false, now: at(OPEN_FOR_MS - 1) })).toBe("/compose");
  });

  test("otherwise opens Today: no prompt yet, already posted, or the prompt has closed", () => {
    expect(prayNowTarget({ prompt: null, posted: false, now: at(0) })).toBe("/");
    expect(prayNowTarget({ prompt: { firedAt }, posted: true, now: at(60_000) })).toBe("/");
    expect(prayNowTarget({ prompt: { firedAt }, posted: false, now: at(OPEN_FOR_MS) })).toBe("/");
  });

  test("the window matches the rules' 24 hours", () => {
    expect(OPEN_FOR_MS).toBe(24 * 60 * 60 * 1000);
    expect(readFileSync("../firebase/firestore.rules", "utf8")).toMatch(/duration\.value\(24, 'h'\)|86400/);
  });
});
