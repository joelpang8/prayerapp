import type { PrayerTime } from "./circles";

/**
 * A prayer circle's weekly prayer time: set by the leader in their own time
 * zone (weekday 1 = Monday ... 7 = Sunday), shown to each member in their
 * phone's time, and (if they turn it on) a weekly reminder on their phone.
 */

/** The phone's time zone, e.g. "America/Chicago". */
export function phoneTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Date and time parts of an instant in a time zone. */
function partsIn(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, weekday };
}

/** The instant when it's this wall-clock time in a time zone. */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  // Start from the same numbers read as UTC, then correct by the zone's offset (twice, for DST edges).
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - shown;
  }
  return new Date(guess);
}

/** The next time the circle prays together, after `now`. */
export function nextPrayerTime(pt: PrayerTime, now: Date): Date {
  const today = partsIn(now, pt.timeZone);
  for (let add = 0; add <= 7; add++) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + add, 12));
    const weekday = ((base.getUTCDay() + 6) % 7) + 1; // Monday = 1
    if (weekday !== pt.weekday) continue;
    const at = zonedInstant(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), pt.hour, pt.minute, pt.timeZone);
    if (at.getTime() > now.getTime()) return at;
  }
  // Same weekday, already past today: next week.
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day + 7, 12));
  return zonedInstant(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), pt.hour, pt.minute, pt.timeZone);
}

/**
 * The weekly reminder in the phone's own time, as expo-notifications wants
 * it (weekday 1 = Sunday). Worked out from the next occurrence, so a member
 * in another time zone is reminded at the right moment; re-checked whenever
 * the app opens (clock changes).
 */
export function localWeeklyTrigger(pt: PrayerTime, now: Date, phoneZone = phoneTimeZone()): { weekday: number; hour: number; minute: number } {
  const p = partsIn(nextPrayerTime(pt, now), phoneZone);
  return { weekday: (p.weekday % 7) + 1, hour: p.hour, minute: p.minute };
}

/** The leader's chosen time as a PrayerTime in their own zone. */
export function prayerTimeFrom(weekday: number, hour: number, minute: number, timeZone = phoneTimeZone()): PrayerTime {
  return { weekday, hour, minute, timeZone };
}

/** "Tuesday" and "7:00 PM" for the next occurrence, in the phone's own time and language. */
export function describePrayerTime(pt: PrayerTime, now: Date, locale: string): { day: string; time: string } {
  const at = nextPrayerTime(pt, now);
  return {
    day: at.toLocaleDateString(locale, { weekday: "long" }),
    time: at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
  };
}

/** Weekday names, Monday first (1 ... 7), in the phone's language. */
export function weekdayNames(locale: string): string[] {
  // 5 January 2026 was a Monday.
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + i, 12)).toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" }));
}
