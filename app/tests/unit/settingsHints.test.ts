import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const settings = readFileSync("src/app/(tabs)/settings.tsx", "utf8");
const infoLabel = readFileSync("src/components/InfoLabel.tsx", "utf8");

test("Settings explanations sit behind an ⓘ next to each setting; a blocked-notifications warning stays visible", () => {
  // Every explanation is an `info` on its setting's label or section title, folded away to start.
  expect((settings.match(/<InfoLabel[\s\S]*?info=/g) ?? []).length).toBeGreaterThanOrEqual(12);
  expect(infoLabel).toContain("useState(false)");
  expect(infoLabel).toContain("information-circle-outline");
  // No separate "About this" lines any more.
  expect(settings).not.toMatch(/<Hint>/);
  // The one thing to fix is never folded away.
  expect(settings).toContain('<Muted>{t("settings.notifBlocked")}</Muted>');
  expect((settings.match(/<Muted>/g) ?? []).length).toBe(1);
});
