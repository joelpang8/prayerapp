import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("tapping a tab you're on scrolls it back to the top, on every tab", () => {
  for (const tab of ["index", "prayers", "friends", "profile", "settings"]) {
    const src = readFileSync(`src/app/(tabs)/${tab}.tsx`, "utf8");
    expect(src, tab).toMatch(/useScrollToTop\((scrollRef|scroll)\)/);
    expect(src, tab).toMatch(/<ScrollView ref=\{(scrollRef|scroll)\}/);
  }
});
