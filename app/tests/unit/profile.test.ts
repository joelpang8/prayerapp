import { describe, expect, test } from "vitest";
import { avatarPathFor, bioProblem, BIO_MAX, initials, profileFromData } from "../../src/lib/profile";

describe("profile helpers", () => {
  test("initials use the first and last word", () => {
    expect(initials("Mary Anne Smith")).toBe("MS");
    expect(initials("alice")).toBe("A");
    expect(initials("  ")).toBe("");
    expect(initials("élise durand")).toBe("ÉD");
  });

  test("bio length limit matches the rules and ignores surrounding spaces", () => {
    expect(BIO_MAX).toBe(160);
    expect(bioProblem("x".repeat(160))).toBeNull();
    expect(bioProblem(` ${"x".repeat(160)} `)).toBeNull();
    expect(bioProblem("x".repeat(161))).not.toBeNull();
  });

  test("avatar paths are built only from safe ids", () => {
    expect(avatarPathFor("alice", "abc123")).toBe("avatars/alice/abc123.jpg");
    expect(() => avatarPathFor("alice", "../x")).toThrow();
  });

  test("a profile without a photo has a null avatarPath", () => {
    expect(profileFromData("u1", { username: "u", displayName: "U" }).avatarPath).toBeNull();
    expect(profileFromData("u1", { username: "u", displayName: "U", avatarPath: "avatars/u1/a.jpg" }).avatarPath).toBe("avatars/u1/a.jpg");
  });
});
