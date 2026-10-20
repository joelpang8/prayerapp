import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("an empty Today with no friends offers Invite and Find friends", () => {
  const today = readFileSync("src/app/(tabs)/index.tsx", "utf8");
  expect(today).toContain("friendsLoaded && graph.friends.size === 0");
  expect(today).toContain("shareInvite(profile.username)");
  expect(today).toContain('router.navigate("/friends")');
});
