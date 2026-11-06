import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { occasionFor } from "../../src/lib/occasions";

test("Thanksgiving is the fourth Thursday of November, as on the server", () => {
  expect(occasionFor("20261126")).toBe("thanksgiving");
  expect(occasionFor("20271125")).toBe("thanksgiving");
  expect(occasionFor("20301128")).toBe("thanksgiving");
  expect(occasionFor("20261125")).toBeNull();
  expect(occasionFor(null)).toBeNull();
  const server = readFileSync("../firebase/functions/src/dailyPrompt.ts", "utf8");
  expect(server).toContain("return day === firstThursday + 21 ? \"thanksgiving\" : null;");
});

test("Today and the posting screen use it (wording only)", () => {
  expect(readFileSync("src/app/(tabs)/index.tsx", "utf8")).toContain('t("today.timeToGiveThanks")');
  expect(readFileSync("src/app/compose.tsx", "utf8")).toContain('t("compose.thankfulPlaceholder")');
});
