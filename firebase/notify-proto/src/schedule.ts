/**
 * Picking the moment for the global daily prompt (v1: everyone at once).
 * Pure functions, so they can be tested without the cloud.
 */
import { randomInt } from "node:crypto";

export type DailyWindow = {
  /** IANA time zone the window is defined in, e.g. "America/Chicago". */
  timeZone: string;
  /** Earliest local time, "HH:MM" (inclusive). */
  earliest: string;
  /** Latest local time, "HH:MM" (exclusive). */
  latest: string;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Offset of `timeZone` from UTC at instant `utcMs`, in ms. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The UTC instant of a local wall-clock time in `timeZone`. DST-safe: on a
 * spring-forward day a nonexistent time moves forward to a real one.
 */
export function zonedToUtc(dateKey: string, hhmm: string, timeZone: string): Date {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(dateKey);
  const t = HHMM.exec(hhmm);
  if (!d || !t) throw new Error(`bad date/time: ${dateKey} ${hhmm}`);
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const first = naive - zoneOffsetMs(naive, timeZone);
  const second = naive - zoneOffsetMs(first, timeZone);
  // Consistent: a normal time (or, on a fall-back day, the first of the two
  // occurrences). Inconsistent: the time falls in a spring-forward gap and
  // doesn't exist; take the later candidate, i.e. move forward past the gap.
  if (zoneOffsetMs(second, timeZone) === zoneOffsetMs(first, timeZone)) return new Date(Math.min(first, second));
  return new Date(Math.max(first, second));
}

/** "20261003" for the calendar date of `instant` in `timeZone`. */
export function dateKeyIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

export function validateWindow(w: DailyWindow): void {
  if (!HHMM.test(w.earliest) || !HHMM.test(w.latest)) throw new Error("earliest/latest must be HH:MM");
  if (w.earliest >= w.latest) throw new Error("earliest must be before latest");
  new Intl.DateTimeFormat("en-US", { timeZone: w.timeZone }); // throws RangeError on an unknown zone
}

/**
 * A uniformly random moment in the day's window, to the second. Uses a
 * cryptographic RNG: nobody should be able to predict tomorrow's prompt.
 */
export function pickFireTime(dateKey: string, w: DailyWindow, rand: (maxExclusive: number) => number = randomInt): Date {
  validateWindow(w);
  const start = zonedToUtc(dateKey, w.earliest, w.timeZone).getTime();
  const end = zonedToUtc(dateKey, w.latest, w.timeZone).getTime();
  const seconds = Math.floor((end - start) / 1000);
  return new Date(start + rand(seconds) * 1000);
}
