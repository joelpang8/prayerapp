import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { errorCode, errorReason } from "../../src/lib/errors";

test("errors say why, with the code to report", () => {
  expect(errorReason({ code: "permission-denied" })).toMatch(/server didn't allow/);
  expect(errorReason({ code: "permission-denied" })).toContain("Code: permission-denied");
  expect(errorReason({ code: "storage/unauthorized" })).toMatch(/server didn't allow/);
  expect(errorReason({ code: "unavailable" })).toMatch(/Couldn't reach the server/);
  expect(errorReason(new Error("boom"))).toBe("Something went wrong. Please try again.");
  expect(errorCode({ code: "firestore/not-found" })).toBe("not-found");
});

test("never on friend requests or profiles, so a block can't show", () => {
  expect(readFileSync("src/app/(tabs)/friends.tsx", "utf8")).not.toContain("errorReason");
  expect(readFileSync("src/components/ProfileView.tsx", "utf8")).not.toContain("errorReason");
});
