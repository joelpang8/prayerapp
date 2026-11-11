import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("crash reports: push builds only, on unless turned off, and never anything about the person", () => {
  const src = readFileSync("src/lib/crashReports.ts", "utf8");
  expect(src).toContain("if (!pushAvailable()) return null;");
  expect(src).toContain('!== "1"');
  expect(src).not.toMatch(/setUserId|setAttribute|setAttributes|\blog\(/);
  expect(readFileSync("react-native.config.js", "utf8")).toContain('"@react-native-firebase/crashlytics": off');
  expect(readFileSync("src/app/settings.tsx", "utf8")).toContain('t("settings.crashReports")');
  const policy = readFileSync("../firebase/hosting/privacy/index.html", "utf8");
  expect(policy).toContain("Send crash reports");
  expect(policy).toContain("backups within 7 days");
});
