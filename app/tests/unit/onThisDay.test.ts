import { afterEach, describe, expect, test } from "vitest";
import { appDayId, isLeapYear, onThisDayIds, yearsAgoText } from "../../src/lib/onThisDay";

describe("the app's day (America/New_York)", () => {
  test("changes at New York midnight, in summer time (UTC-4)", () => {
    expect(appDayId(new Date("2026-10-09T03:59:59Z"))).toBe("20261008");
    expect(appDayId(new Date("2026-10-09T04:00:00Z"))).toBe("20261009");
  });

  test("changes at New York midnight, in winter time (UTC-5)", () => {
    expect(appDayId(new Date("2026-12-01T04:59:59Z"))).toBe("20261130");
    expect(appDayId(new Date("2026-12-01T05:00:00Z"))).toBe("20261201");
  });

  test("across the spring clock change (8 March 2026)", () => {
    // Midnight before the change is still UTC-5; the next midnight is UTC-4.
    expect(appDayId(new Date("2026-03-08T04:59:59Z"))).toBe("20260307");
    expect(appDayId(new Date("2026-03-08T05:00:00Z"))).toBe("20260308");
    expect(appDayId(new Date("2026-03-08T07:30:00Z"))).toBe("20260308"); // the skipped 2–3am hour
    expect(appDayId(new Date("2026-03-09T03:59:59Z"))).toBe("20260308");
    expect(appDayId(new Date("2026-03-09T04:00:00Z"))).toBe("20260309");
  });

  test("across the autumn clock change (1 November 2026)", () => {
    expect(appDayId(new Date("2026-11-01T03:59:59Z"))).toBe("20261031");
    expect(appDayId(new Date("2026-11-01T04:00:00Z"))).toBe("20261101");
    expect(appDayId(new Date("2026-11-01T06:30:00Z"))).toBe("20261101"); // the repeated 1–2am hour
    expect(appDayId(new Date("2026-11-02T04:59:59Z"))).toBe("20261101");
    expect(appDayId(new Date("2026-11-02T05:00:00Z"))).toBe("20261102");
  });

  test("the same without formatToParts (older JavaScript engines)", () => {
    const proto = Intl.DateTimeFormat.prototype as { formatToParts?: unknown };
    const original = proto.formatToParts;
    try {
      delete proto.formatToParts;
      expect(appDayId(new Date("2026-10-09T03:59:59Z"))).toBe("20261008");
      expect(appDayId(new Date("2026-03-08T05:00:00Z"))).toBe("20260308");
    } finally {
      proto.formatToParts = original;
    }
  });

  test("New Year's Eve in New York is already New Year's Day in UTC", () => {
    expect(appDayId(new Date("2027-01-01T03:00:00Z"))).toBe("20261231");
  });

  describe("doesn't depend on the phone's time zone", () => {
    const original = process.env.TZ;
    afterEach(() => { process.env.TZ = original; });

    for (const tz of ["Australia/Sydney", "America/Los_Angeles", "Asia/Kolkata", "UTC"]) {
      test(tz, () => {
        process.env.TZ = tz;
        expect(appDayId(new Date("2026-10-09T03:59:59Z"))).toBe("20261008");
        expect(appDayId(new Date("2026-10-09T04:00:00Z"))).toBe("20261009");
      });
    }

    test("a trip across zones mid-day doesn't change which day it is", () => {
      const instant = new Date("2026-10-08T23:30:00Z"); // 7:30pm in New York
      process.env.TZ = "America/New_York";
      const before = appDayId(instant);
      process.env.TZ = "Asia/Tokyo"; // already 9 October there
      expect(appDayId(instant)).toBe(before);
      expect(before).toBe("20261008");
    });
  });
});

describe("on this day", () => {
  test("the same month and day in each earlier year, newest first", () => {
    expect(onThisDayIds("20291008", 2025)).toEqual(["20281008", "20271008", "20261008", "20251008"]);
  });

  test("nothing in the first year", () => {
    expect(onThisDayIds("20251008", 2025)).toEqual([]);
  });

  test("leap years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  test("on 28 February in a common year, 29 February posts from leap years show too", () => {
    expect(onThisDayIds("20290228", 2023)).toEqual(["20280228", "20280229", "20270228", "20260228", "20250228", "20240228", "20240229", "20230228"]);
  });

  test("on 28 February in a leap year, they wait for the 29th", () => {
    expect(onThisDayIds("20280228", 2023)).toEqual(["20270228", "20260228", "20250228", "20240228", "20230228"]);
  });

  test("on 29 February, only earlier 29 Februaries", () => {
    expect(onThisDayIds("20280229", 2019)).toEqual(["20240229", "20200229"]);
  });

  test("1 March is never given 29 February's posts", () => {
    expect(onThisDayIds("20290301", 2024)).toEqual(["20280301", "20270301", "20260301", "20250301", "20240301"]);
  });

  test("New Year's Day and 31 December", () => {
    expect(onThisDayIds("20270101", 2025)).toEqual(["20260101", "20250101"]);
    expect(onThisDayIds("20261231", 2025)).toEqual(["20251231"]);
  });

  test("a long history goes back to the first year (queried 30 at a time)", () => {
    const ids = onThisDayIds("20601008", 2025);
    expect(ids).toHaveLength(35);
    expect(ids[34]).toBe("20251008");
  });

  test("how long ago", () => {
    expect(yearsAgoText("20271008", "20261008")).toBe("1 year ago");
    expect(yearsAgoText("20290228", "20240229")).toBe("5 years ago");
  });
});
