import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the Info.plist fix runs after both widget extensions are added", () => {
  const config = readFileSync("app.config.ts", "utf8");
  const fix = config.indexOf('"./plugins/withUniqueFileRefs"');
  expect(fix).toBeGreaterThan(-1);
  // Listed before them = runs after them (mods run in reverse order).
  expect(fix).toBeLessThan(config.indexOf('"expo-live-activity"'));
  expect(fix).toBeLessThan(config.indexOf('"expo-widgets"'));
});
