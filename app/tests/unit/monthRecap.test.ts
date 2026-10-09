import { afterEach, describe, expect, test } from "vitest";
import { appMonthOf, buildRecap, dayKeyOfPromptId, monthIdRange, prayersText } from "../../src/lib/monthRecap";

const at = (iso: string) => new Date(iso);

describe("the app's month (America/New_York)", () => {
  test("a month ends at New York midnight, not UTC's", () => {
    expect(appMonthOf(at("2026-10-01T03:59:59Z"))).toEqual({ year: 2026, month: 9 });
    expect(appMonthOf(at("2026-10-01T04:00:00Z"))).toEqual({ year: 2026, month: 10 });
  });

  test("autumn clock change on 1 November 2026: the month turns at 4:00 UTC (still summer time)", () => {
    expect(appMonthOf(at("2026-11-01T03:59:59Z"))).toEqual({ year: 2026, month: 10 });
    expect(appMonthOf(at("2026-11-01T04:00:00Z"))).toEqual({ year: 2026, month: 11 });
    expect(appMonthOf(at("2026-11-01T06:30:00Z"))).toEqual({ year: 2026, month: 11 }); // the repeated hour
    // ...and the next month turns at 5:00 UTC (winter time).
    expect(appMonthOf(at("2026-12-01T04:59:59Z"))).toEqual({ year: 2026, month: 11 });
    expect(appMonthOf(at("2026-12-01T05:00:00Z"))).toEqual({ year: 2026, month: 12 });
  });

  test("spring clock change on 8 March 2026 stays in March; March ends on summer time", () => {
    expect(appMonthOf(at("2026-03-01T04:59:59Z"))).toEqual({ year: 2026, month: 2 });
    expect(appMonthOf(at("2026-03-01T05:00:00Z"))).toEqual({ year: 2026, month: 3 });
    expect(appMonthOf(at("2026-03-08T06:30:00Z"))).toEqual({ year: 2026, month: 3 }); // the skipped hour
    expect(appMonthOf(at("2026-04-01T03:59:59Z"))).toEqual({ year: 2026, month: 3 });
    expect(appMonthOf(at("2026-04-01T04:00:00Z"))).toEqual({ year: 2026, month: 4 });
  });

  test("New Year", () => {
    expect(appMonthOf(at("2027-01-01T04:59:59Z"))).toEqual({ year: 2026, month: 12 });
    expect(appMonthOf(at("2027-01-01T05:00:00Z"))).toEqual({ year: 2027, month: 1 });
  });

  test("leap year: 29 February is in February", () => {
    expect(appMonthOf(at("2028-02-29T23:00:00Z"))).toEqual({ year: 2028, month: 2 });
    expect(appMonthOf(at("2028-03-01T04:59:59Z"))).toEqual({ year: 2028, month: 2 });
    expect(appMonthOf(at("2028-03-01T05:00:00Z"))).toEqual({ year: 2028, month: 3 });
  });

  describe("a trip across time zones doesn't move a prayer to another month", () => {
    const original = process.env.TZ;
    afterEach(() => { process.env.TZ = original; });

    test("the same instant is the same month in Sydney, Los Angeles, London and New York", () => {
      // 8pm on 31 October in New York: already November in Sydney and London.
      const instant = at("2026-11-01T00:00:00Z");
      for (const tz of ["Australia/Sydney", "America/Los_Angeles", "Europe/London", "America/New_York"]) {
        process.env.TZ = tz;
        expect(appMonthOf(instant)).toEqual({ year: 2026, month: 10 });
      }
    });
  });
});

describe("month ranges of prompt ids", () => {
  test("from the 1st to the next month's 1st", () => {
    expect(monthIdRange({ year: 2026, month: 10 })).toEqual({ from: "20261001", to: "20261101" });
  });

  test("December runs into January of the next year", () => {
    expect(monthIdRange({ year: 2026, month: 12 })).toEqual({ from: "20261201", to: "20270101" });
  });

  test("February of a leap year includes the 29th", () => {
    const { from, to } = monthIdRange({ year: 2028, month: 2 });
    for (const id of ["20280201", "20280228", "20280229"]) expect(id >= from && id < to).toBe(true);
    expect("20280301" < to).toBe(false);
    expect("20280131" >= from).toBe(false);
  });

  test("day keys for the calendar", () => {
    expect(dayKeyOfPromptId("20280229")).toBe("2028-02-29");
  });
});

describe("the recap", () => {
  const me = "alice";
  const post = (promptId: string, extra: Partial<{ authorId: string; answeredAt: Date | null; verseRef: string | null }> = {}) =>
    ({ authorId: me, promptId, answeredAt: null, verseRef: null, ...extra });

  test("counts my posts and how many are marked answered", () => {
    const r = buildRecap(me, [post("20261003"), post("20261001", { answeredAt: new Date() }), post("20261009")]);
    expect(r.posted).toBe(3);
    expect(r.answered).toBe(1);
  });

  test("verses from the days I posted, once each, in date order; nothing for other days", () => {
    const r = buildRecap(me, [
      post("20261009", { verseRef: "PHP.4.6-7" }),
      post("20261002", { verseRef: "PSA.145.18" }),
      post("20261005"),
      post("20261007", { verseRef: "PSA.145.18" }),
    ]);
    expect(r.verses).toEqual(["PSA.145.18", "PHP.4.6-7"]);
  });

  test("never counts anyone else's post", () => {
    const r = buildRecap(me, [post("20261001"), post("20261002", { authorId: "bob", verseRef: "JHN.3.16", answeredAt: new Date() })]);
    expect(r).toEqual({ posted: 1, answered: 0, verses: [] });
  });

  test("an empty month is all zeros (the card isn't shown)", () => {
    expect(buildRecap(me, [])).toEqual({ posted: 0, answered: 0, verses: [] });
  });

  test("wording", () => {
    expect(prayersText(1)).toBe("1 prayer");
    expect(prayersText(12)).toBe("12 prayers");
  });
});
