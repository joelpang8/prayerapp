/**
 * "Candle mode": after I post, a small candle stays lit on Today until the
 * next day's prompt, burning down slowly over the day. A quiet "you prayed
 * today": nothing is counted, kept or compared (no streaks), and it's only
 * on my own Today screen.
 */

/** The candle burns down over this long after posting. */
export const CANDLE_BURN_MS = 24 * 60 * 60 * 1000;
/** It never quite goes out while it's shown. */
export const CANDLE_MIN_LEFT = 0.2;

/** How much of the candle is left (1 = just posted), from when I posted. */
export function prayedCandleLeft(postedAt: Date, now: number): number {
  const burnt = Math.max(0, now - postedAt.getTime()) / CANDLE_BURN_MS;
  return Math.max(CANDLE_MIN_LEFT, 1 - burnt);
}
