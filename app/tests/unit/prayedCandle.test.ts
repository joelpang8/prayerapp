import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CANDLE_BURN_MS, CANDLE_MIN_LEFT, prayedCandleLeft } from "../../src/lib/prayedCandle";

const posted = new Date("2026-10-29T18:00:00Z");

test("the candle starts full and burns down over the day, never going out while shown", () => {
  expect(prayedCandleLeft(posted, posted.getTime())).toBe(1);
  expect(prayedCandleLeft(posted, posted.getTime() + CANDLE_BURN_MS / 2)).toBeCloseTo(0.5);
  expect(prayedCandleLeft(posted, posted.getTime() + CANDLE_BURN_MS * 2)).toBe(CANDLE_MIN_LEFT);
  expect(prayedCandleLeft(posted, posted.getTime() - 5000)).toBe(1); // a phone clock behind the server
});

test("no streaks, counts or comparisons in its wording", async () => {
  const { default: strings } = await import("../../src/i18n/strings/posting");
  const words = Object.entries(strings.en).filter(([k]) => k.startsWith("candle.")).map(([, v]) => v).join(" ").toLowerCase();
  expect(words.length).toBeGreaterThan(0);
  expect(words).not.toMatch(/streak|days? in a row|again tomorrow|don't miss|missed|keep it up|record/);
  expect(readFileSync("src/lib/prayedCandle.ts", "utf8")).not.toMatch(/AsyncStorage|setDoc|addDoc/);
});
