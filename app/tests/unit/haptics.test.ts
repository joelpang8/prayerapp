import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("haptics only for the moments that matter, never while typing or scrolling", () => {
  const uses = {
    "src/app/compose.tsx": "haptics.done()",
    "src/components/OwnPostActions.tsx": "haptics.done()",
    "src/components/PrayerRequests.tsx": "haptics.tap()",
    "src/components/VerseBlock.tsx": "haptics.tap()",
  };
  for (const [file, call] of Object.entries(uses)) expect(readFileSync(file, "utf8"), file).toContain(call);
  const compose = readFileSync("src/app/compose.tsx", "utf8");
  expect(compose.match(/haptics\./g)).toHaveLength(1);
  expect(readFileSync("src/lib/haptics.ts", "utf8")).toMatch(/catch\(\(\) => \{\}\)/);
});
