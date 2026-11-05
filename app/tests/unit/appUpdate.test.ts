import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { updateState } from "../../src/lib/appUpdate";

test("the banner shows only when a newer build is set, and can't be hidden below the minimum", () => {
  expect(updateState("6", { latestBuild: 7 })).toBe("available");
  expect(updateState("7", { latestBuild: 7 })).toBe("none");
  expect(updateState("8", { latestBuild: 7 })).toBe("none");
  expect(updateState("4", { latestBuild: 7, minimumBuild: 5 })).toBe("required");
  expect(updateState("6", undefined)).toBe("none");
  expect(updateState(null, { latestBuild: 7 })).toBe("none");
  expect(updateState("1.2", { latestBuild: 7 })).toBe("none");
});

test("it's on Today, only for TestFlight builds, and slim", () => {
  expect(readFileSync("src/app/(tabs)/index.tsx", "utf8")).toContain("<UpdateBanner />");
  const banner = readFileSync("src/components/UpdateBanner.tsx", "utf8");
  expect(banner).toContain("ApplicationReleaseType.APP_STORE");
  expect(banner).toContain("numberOfLines={1}");
});
