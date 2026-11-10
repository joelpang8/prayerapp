import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { splitFeed } from "../../src/lib/todayFeed";

test("today's prayers first; earlier ones behind See earlier prayers", () => {
  const feed = [{ id: "a", promptId: "20261110" }, { id: "b", promptId: "20261109" }, { id: "c", promptId: "20261110" }];
  const { today, earlier } = splitFeed(feed, "20261110");
  expect(today.map((p) => p.id)).toEqual(["a", "c"]);
  expect(earlier.map((p) => p.id)).toEqual(["b"]);
  expect(splitFeed(feed, null).today).toHaveLength(3);
  const screen = readFileSync("src/app/(tabs)/index.tsx", "utf8");
  expect(screen).toContain('tn("today.seeEarlier", earlier.length)');
  expect(screen).toContain("{shownFeed.map((post) => (");
});
