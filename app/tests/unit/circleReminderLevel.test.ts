import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the weekly circle reminder is Time Sensitive, like the daily Pray now", () => {
  const src = readFileSync("src/session/useCircleReminders.ts", "utf8");
  expect(src).toContain('interruptionLevel: "timeSensitive"');
  expect(readFileSync("app.config.ts", "utf8")).toContain('"com.apple.developer.usernotifications.time-sensitive": true');
});
