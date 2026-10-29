import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("changing a username is one batch: profile, new claim, old claim released", () => {
  const src = readFileSync("src/lib/profile.ts", "utf8");
  const fn = src.slice(src.indexOf("export async function changeUsername"), src.indexOf("export function changeDisplayName"));
  expect(fn).toContain("writeBatch(db)");
  expect(fn).toContain('batch.update(doc(db, "users", uid), { username: to })');
  expect(fn).toContain('batch.set(doc(db, "usernames", to), { uid })');
  expect(fn).toContain('batch.delete(doc(db, "usernames", from))');
  expect(fn).toContain("UsernameTakenError");
});

test("Edit profile checks a new username like sign-up does", () => {
  const screen = readFileSync("src/app/edit-profile.tsx", "utf8");
  expect(screen).toContain("usernameProblem(normalized)");
  expect(screen).toContain("normalizeUsername(username)");
  expect(screen).toContain('t("editProfile.usernameNote")');
});
