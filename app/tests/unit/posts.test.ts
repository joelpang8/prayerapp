import { describe, expect, test } from "vitest";
import { base64ToBytes, bytesToBase64 } from "../../src/lib/base64";
import { isLate, notesProblem, ON_TIME_WINDOW_MS, photoPathFor, postIdFor } from "../../src/lib/posts";

describe("isLate", () => {
  const fired = new Date("2026-09-29T15:00:00Z");
  const at = (ms: number) => ({ promptFiredAt: fired, createdAt: new Date(fired.getTime() + ms) });

  test("on time within the 2-minute window and the 5-minute grace period", () => {
    expect(isLate(at(0))).toBe(false);
    expect(isLate(at(2 * 60_000))).toBe(false);
    expect(isLate(at(ON_TIME_WINDOW_MS))).toBe(false);
  });

  test("late after 7 minutes", () => {
    expect(isLate(at(ON_TIME_WINDOW_MS + 1))).toBe(true);
    expect(isLate(at(3 * 60 * 60_000))).toBe(true);
  });
});

describe("post helpers", () => {
  test("notes validation", () => {
    expect(notesProblem("   ")).not.toBeNull();
    expect(notesProblem("x".repeat(2001))).not.toBeNull();
    expect(notesProblem("For my mum")).toBeNull();
  });

  test("ids and photo paths match the rules' formats", () => {
    expect(postIdFor("20260929", "abc123")).toBe("20260929_abc123");
    expect(photoPathFor("abc123", "f00d")).toBe("postPhotos/abc123/f00d.jpg");
    expect(() => photoPathFor("abc123", "bad-id")).toThrow();
    expect(() => photoPathFor("abc123", "../x")).toThrow();
  });

  test.each([0, 1, 2, 3, 4, 100, 1001])("base64 round-trips %i bytes", (n) => {
    const bytes = new Uint8Array(n).map((_, i) => (i * 53 + 7) % 256);
    expect(base64ToBytes(bytesToBase64(bytes.buffer))).toEqual(bytes);
    expect(base64ToBytes(Buffer.from(bytes).toString("base64"))).toEqual(bytes);
  });
});
