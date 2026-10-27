import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const settings = readFileSync("src/app/(tabs)/settings.tsx", "utf8");

test("Settings explanations fold away; a blocked-notifications warning stays visible", () => {
  expect((settings.match(/<Hint>/g) ?? []).length).toBeGreaterThanOrEqual(10);
  expect(settings).toContain('<Muted>{t("settings.notifBlocked")}</Muted>');
  expect((settings.match(/<Muted>/g) ?? []).length).toBe(1);
  expect(readFileSync("src/components/Hint.tsx", "utf8")).toContain("useState(false)");
});
