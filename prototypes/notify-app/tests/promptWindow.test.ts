import { describe, expect, test } from "vitest";
import { mmss, parsePromptData, windowState } from "../src/promptWindow";

const W = 120_000;
const G = 300_000;

describe("windowState", () => {
  test("respond -> grace -> late at the exact boundaries", () => {
    expect(windowState(0, 0, W, G)).toEqual({ phase: "respond", msLeft: W, elapsed: 0 });
    expect(windowState(0, W - 1, W, G).phase).toBe("respond");
    expect(windowState(0, W, W, G)).toEqual({ phase: "grace", msLeft: G, elapsed: W });
    expect(windowState(0, W + G - 1, W, G).phase).toBe("grace");
    expect(windowState(0, W + G, W, G)).toEqual({ phase: "late", msLeft: 0, elapsed: W + G });
  });

  test("a delayed push shows less time, measured from the server's firedAt", () => {
    // Push arrived 45 s after firing: 1:15 left, not 2:00.
    expect(mmss(windowState(1_000_000, 1_045_000, W, G).msLeft)).toBe("1:15");
  });

  test("device clock slightly behind the server doesn't show more than the full window", () => {
    expect(windowState(1_000_000, 998_000, W, G)).toMatchObject({ phase: "respond", msLeft: W });
  });

  test("the 2 + 5 minute window matches the server's 7 minutes", () => {
    expect(W + G).toBe(7 * 60_000);
  });
});

test("mmss", () => {
  expect(mmss(120_000)).toBe("2:00");
  expect(mmss(119_001)).toBe("2:00");
  expect(mmss(59_000)).toBe("0:59");
  expect(mmss(1)).toBe("0:01");
  expect(mmss(0)).toBe("0:00");
  expect(mmss(-5)).toBe("0:00");
});

describe("parsePromptData", () => {
  const good = { kind: "prompt", promptId: "p1", firedAt: "2026-07-15T18:31:07.000Z", windowMs: "120000", graceMs: "300000", verseRef: "PHP.4.6-7" };

  test("reads the payload notify-proto sends", () => {
    expect(parsePromptData(good)).toEqual({ promptId: "p1", firedAtMs: Date.parse(good.firedAt), windowMs: W, graceMs: G, verseRef: "PHP.4.6-7" });
    expect(parsePromptData({ ...good, verseRef: undefined })?.verseRef).toBeNull();
  });

  test("ignores anything else", () => {
    expect(parsePromptData(undefined)).toBeNull();
    expect(parsePromptData({ kind: "other" })).toBeNull();
    expect(parsePromptData({ ...good, firedAt: "not a date" })).toBeNull();
    expect(parsePromptData({ ...good, windowMs: "0" })).toBeNull();
  });
});
