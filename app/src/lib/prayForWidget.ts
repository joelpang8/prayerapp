import { appDayId } from "./onThisDay";
import { todaysPicks, type PrayerItem } from "./prayerList";

/**
 * What the "Pray for" widget shows, worked out ahead: today's picks now, and
 * each following app day's (America/New_York) from its midnight, so the
 * widget moves on even if the app isn't opened. Pure, for tests.
 */
export type WidgetDay = { date: Date; dayId: string; names: string[] };

/** The first instant of the app day after `from`'s. */
export function nextAppDayStart(from: Date): Date {
  const today = appDayId(from);
  let hi = from.getTime() + 3_600_000;
  while (appDayId(new Date(hi)) === today) hi += 3_600_000;
  let lo = hi - 3_600_000;
  // First minute of the new day (time zones change on whole minutes).
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
    if (appDayId(new Date(mid)) === today) lo = mid; else hi = mid;
  }
  return new Date(hi);
}

export function widgetDays(items: readonly PrayerItem[], now: Date, days = 7): WidgetDay[] {
  const out: WidgetDay[] = [];
  let at = now;
  for (let i = 0; i < days; i++) {
    const dayId = appDayId(at);
    out.push({ date: at, dayId, names: todaysPicks(items, dayId).map((p) => p.name) });
    at = nextAppDayStart(at);
  }
  return out;
}
