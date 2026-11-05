import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { nextAppDayStart, widgetDays } from "../../src/lib/prayForWidget";
import { appDayId } from "../../src/lib/onThisDay";
import type { PrayerItem } from "../../src/lib/prayerList";

let n = 0;
const item = (over: Partial<PrayerItem> = {}): PrayerItem => {
  n++;
  return { id: `w${n}`, name: `Person ${n}`, note: "", group: "family", often: "weekly", order: n, createdAt: new Date(2026, 0, 1, 0, n), answered: null, ...over };
};

describe("the Pray for widget", () => {
  test("a new app day starts at midnight in New York, clocks changing included", () => {
    // 2026-11-05 15:00 UTC is 10:00 in New York; the next day starts 05:00 UTC (EST).
    expect(nextAppDayStart(new Date("2026-11-05T15:00:00Z")).toISOString()).toBe("2026-11-06T05:00:00.000Z");
    // Across the change back to standard time (1 Nov 2026): Oct 31 is EDT.
    expect(nextAppDayStart(new Date("2026-10-31T15:00:00Z")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  test("today's picks now, then each next day's from its midnight, a week ahead", () => {
    const list = [item({ often: "daily", name: "Mum" }), ...Array.from({ length: 7 }, () => item())];
    const now = new Date("2026-11-05T15:00:00Z");
    const days = widgetDays(list, now);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(now);
    expect(days[0].dayId).toBe("20261105");
    expect(days.map((d) => d.dayId)).toEqual(["20261105", "20261106", "20261107", "20261108", "20261109", "20261110", "20261111"]);
    for (const d of days) {
      expect(appDayId(d.date)).toBe(d.dayId);
      expect(d.names[0]).toBe("Mum");
      expect(d.names).toHaveLength(2);
    }
    expect(widgetDays([], now)[0].names).toEqual([]);
  });

  test("set up only with the paid team, kept up to date from the tabs, and only my own list", () => {
    const config = readFileSync("app.config.ts", "utf8");
    expect(config).toMatch(/appleTeamId\s*\n?\s*\? \[\[\s*"expo-widgets"/);
    expect(config).toContain('name: "PrayForWidget"');
    expect(readFileSync("src/app/(tabs)/_layout.tsx", "utf8")).toContain("usePrayForWidget();");
    const hook = readFileSync("src/session/usePrayForWidget.ts", "utf8");
    expect(hook).toContain("usePrayerList()");
    expect(hook).not.toMatch(/useFeed|useProfiles|circle/i);
    expect(readFileSync("src/widgets/PrayForWidget.tsx", "utf8")).toContain('createWidget("PrayForWidget"');
  });
});

describe("Siri: add to my prayer list", () => {
  test("opens the Add screen with the name, using the app's own link", () => {
    const swift = readFileSync("plugins/ios/PrayerListShortcut.swift", "utf8");
    expect(swift).toContain('components.host = "prayer-list"');
    expect(swift).toContain('components.path = "/edit"');
    expect(swift).toContain("static let openAppWhenRun: Bool = true");
    // Every App Shortcut phrase must name the app.
    const phrases = swift.match(/"[^"]*\\\(\.applicationName\)[^"]*"/g) ?? [];
    expect(phrases.length).toBe(3);
    expect(readFileSync("app.config.ts", "utf8")).toContain('"./plugins/withPrayerListShortcut"');
    expect(readFileSync("src/app/prayer-list/edit.tsx", "utf8")).toContain("name: givenName");
  });
});
