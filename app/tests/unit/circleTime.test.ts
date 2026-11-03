import { describe, expect, test } from "vitest";
import { localWeeklyTrigger, nextPrayerTime } from "../../src/lib/circleTime";

const tue7pmChicago = { weekday: 2, hour: 19, minute: 0, timeZone: "America/Chicago" };

describe("a circle's weekly prayer time", () => {
  test("the next Tuesday 7 PM in Chicago", () => {
    // Monday 2 November 2026, noon UTC (Chicago is UTC-6 after 1 November).
    expect(nextPrayerTime(tue7pmChicago, new Date("2026-11-02T12:00:00Z")).toISOString()).toBe("2026-11-04T01:00:00.000Z");
    // Already past this week's: the following Tuesday.
    expect(nextPrayerTime(tue7pmChicago, new Date("2026-11-04T01:30:00Z")).toISOString()).toBe("2026-11-11T01:00:00.000Z");
  });

  test("summer time is handled (Chicago is UTC-5 in October)", () => {
    expect(nextPrayerTime(tue7pmChicago, new Date("2026-10-19T12:00:00Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  test("reminders in each member's own time (expo weekday: 1 = Sunday)", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(localWeeklyTrigger(tue7pmChicago, now, "America/Chicago")).toEqual({ weekday: 3, hour: 19, minute: 0 });
    expect(localWeeklyTrigger(tue7pmChicago, now, "America/New_York")).toEqual({ weekday: 3, hour: 20, minute: 0 });
    // In London it's already Wednesday 1 AM.
    expect(localWeeklyTrigger(tue7pmChicago, now, "Europe/London")).toEqual({ weekday: 4, hour: 1, minute: 0 });
  });
});
