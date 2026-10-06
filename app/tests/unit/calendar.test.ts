import { describe, expect, test } from "vitest";
import { addMonths, dayKey, monthGrid } from "../../src/lib/calendar";

describe("calendar", () => {
  test("October 2026 starts on a Thursday and has 31 days in 5 weeks", () => {
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks).toHaveLength(5);
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]!.getDate()).toBe(1);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  test("February in leap and common years", () => {
    expect(monthGrid({ year: 2028, month: 2 }).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid({ year: 2027, month: 2 }).flat().filter(Boolean)).toHaveLength(28);
  });

  test("moving between months across a year boundary", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  test("day keys use the local date", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
