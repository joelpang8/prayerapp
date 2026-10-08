/**
 * "On this day" in the Prayers tab: my own posts from the same month and day
 * in earlier years.
 *
 * Days are the app's days, not the phone's: a prompt's id is its date in
 * America/New_York (the decided prompt time zone), and a post's promptId is
 * that prompt's. Matching on those ids means travelling, a phone set to
 * another zone, or the clocks changing never moves a prayer to a different
 * day, and the query is a simple lookup by id.
 */

export const APP_TIME_ZONE = "America/New_York";
/** No prompts were sent before this year. */
export const FIRST_YEAR = 2025;

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The app's day for an instant, as a prompt id: "20261008". */
export function appDayId(at: Date): string {
  if (typeof dayFormat.formatToParts === "function") {
    const parts = Object.fromEntries(dayFormat.formatToParts(at).map((p) => [p.type, p.value]));
    return `${parts.year}${parts.month}${parts.day}`;
  }
  // Fallback for an engine without formatToParts: en-US is "MM/DD/YYYY".
  const [month, day, year] = dayFormat.format(at).split(/\D+/);
  return `${year}${month}${day}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Prompt ids for this month and day in each earlier year, newest first,
 * back to `firstYear`. 29 February posts show on 28 February in the years
 * without one (and on 29 February in leap years).
 */
export function onThisDayIds(todayId: string, firstYear = FIRST_YEAR): string[] {
  const year = Number(todayId.slice(0, 4));
  const mmdd = todayId.slice(4);
  const ids: string[] = [];
  for (let y = year - 1; y >= firstYear; y--) {
    if (mmdd !== "0229") ids.push(`${y}${mmdd}`);
    else if (isLeapYear(y)) ids.push(`${y}0229`);
    if (mmdd === "0228" && !isLeapYear(year) && isLeapYear(y)) ids.push(`${y}0229`);
  }
  return ids;
}

/** "1 year ago", "3 years ago": from today's id and a post's prompt id. */
export function yearsAgoText(todayId: string, promptId: string): string {
  const n = Number(todayId.slice(0, 4)) - Number(promptId.slice(0, 4));
  return n === 1 ? "1 year ago" : `${n} years ago`;
}
