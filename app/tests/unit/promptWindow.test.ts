import { describe, expect, test } from "vitest";
import { candleLeft, mmss, windowState } from "../../src/lib/promptWindow";

const S = 1000;
const fired = 1_000_000;

test("2 minutes to pray, then 5 minutes' grace, then late", () => {
  expect(windowState(fired, fired)).toMatchObject({ phase: "respond", msLeft: 120 * S, fractionLeft: 1 });
  expect(windowState(fired, fired + 17 * S)).toMatchObject({ phase: "respond", msLeft: 103 * S });
  expect(windowState(fired, fired + 120 * S)).toMatchObject({ phase: "grace", msLeft: 300 * S, fractionLeft: 1 });
  expect(windowState(fired, fired + 419 * S)).toMatchObject({ phase: "grace", msLeft: 1 * S });
  expect(windowState(fired, fired + 420 * S)).toMatchObject({ phase: "late", msLeft: 0 });
});

test("a phone clock behind the server's shows the full window, not more", () => {
  expect(windowState(fired, fired - 5 * S)).toMatchObject({ phase: "respond", msLeft: 120 * S });
});

test("mm:ss like BeReal, rounding up", () => {
  expect(mmss(103 * S)).toBe("01:43");
  expect(mmss(120 * S)).toBe("02:00");
  expect(mmss(999)).toBe("00:01");
  expect(mmss(0)).toBe("00:00");
  expect(mmss(-5)).toBe("00:00");
});

describe("the candle", () => {
  const fired = 1_000_000;
  test("burns down over the whole on-time window (prayer time + grace)", () => {
    expect(candleLeft(fired, fired)).toBe(1);
    expect(candleLeft(fired, fired + 2 * 60_000)).toBeCloseTo(5 / 7);
    expect(candleLeft(fired, fired + 7 * 60_000)).toBe(0);
  });

  test("never below empty or above full", () => {
    expect(candleLeft(fired, fired + 60 * 60_000)).toBe(0);
    expect(candleLeft(fired, fired - 5_000)).toBe(1); // phone clock a little behind
  });
});
