import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("tapping a tab you're on scrolls it back to the top, on every tab", () => {
  for (const tab of ["index", "prayers", "friends", "profile"]) {
    const src = readFileSync(`src/app/(tabs)/${tab}.tsx`, "utf8");
    expect(src, tab).toMatch(/useScrollToTop\((scrollRef|scroll)\)/);
    expect(src, tab).toMatch(/<ScrollView ref=\{(scrollRef|scroll)\}/);
  }
});

test("five tabs, with Today exactly in the middle; Settings opens from Profile", () => {
  const layout = readFileSync("src/app/(tabs)/_layout.tsx", "utf8");
  const tabs = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
  expect(tabs).toEqual(["friends", "prayers", "index", "circles", "profile"]);
  expect(layout).toContain("headerRight: () => <SettingsGear />");
});
