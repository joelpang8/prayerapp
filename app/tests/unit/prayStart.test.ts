import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { canStart, onTimeByStart, START_GRACE_MS, startStillValid, stampMs } = await import("../../src/lib/prayStart");
const { isLate } = await import("../../src/lib/posts");

const fired = Date.UTC(2026, 9, 28, 18, 0, 0);
const min = 60_000;
const stamp = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });

describe("Pray now keeps you on time", () => {
  test("can start only in the first 7 minutes", () => {
    expect(canStart(fired, fired + 6 * min)).toBe(true);
    expect(canStart(fired, fired + 7 * min)).toBe(false);
    expect(canStart(fired, fired - 1000)).toBe(false);
  });

  test("15 minutes from pressing Pray now", () => {
    expect(START_GRACE_MS).toBe(15 * min);
    const s = stamp(fired + 5 * min);
    expect(stampMs(s)).toBe(fired + 5 * min);
    expect(startStillValid(s, fired + 19 * min)).toBe(true);
    expect(startStillValid(s, fired + 20 * min)).toBe(false);
  });

  test("a post within 15 minutes of an on-time start is on time; otherwise as before", () => {
    const at = (m: number) => new Date(fired + m * min);
    expect(isLate({ promptFiredAt: at(0), createdAt: at(18), startedAt: at(5) })).toBe(false);
    expect(isLate({ promptFiredAt: at(0), createdAt: at(21), startedAt: at(5) })).toBe(true);
    expect(isLate({ promptFiredAt: at(0), createdAt: at(18), startedAt: null })).toBe(true);
    expect(isLate({ promptFiredAt: at(0), createdAt: at(6) })).toBe(false);
    expect(onTimeByStart(fired, fired + 8 * min, fired + 9 * min)).toBe(false);
  });

  test("leaving the posting screen without posting gives the start up", () => {
    const compose = readFileSync("src/app/compose.tsx", "utf8");
    expect(compose).toContain("if (!posted.current) void cancelPraying(db, uid, startPromptId);");
    expect(compose).toContain("posted.current = true;");
  });
});
