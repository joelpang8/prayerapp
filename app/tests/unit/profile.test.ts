import { describe, expect, test } from "vitest";
import { aboutProblem, avatarPathFor, bioProblem, BIO_MAX, birthdayValue, EMPTY_ABOUT, formatBirthday, initials, parseBirthday, profileFromData } from "../../src/lib/profile";

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

describe("birthdays", () => {
  test("month and day, with an optional year", () => {
    expect(birthdayValue(3, 14)).toBe("03-14");
    expect(birthdayValue(3, 14, 1990)).toBe("1990-03-14");
    expect(parseBirthday("1990-03-14")).toEqual({ year: 1990, month: 3, day: 14 });
    expect(parseBirthday("03-14")).toEqual({ year: undefined, month: 3, day: 14 });
  });

  test("only real dates; Feb 29 needs a leap year when a year is given", () => {
    expect(birthdayValue(2, 29)).toBe("02-29");
    expect(birthdayValue(2, 29, 2000)).toBe("2000-02-29");
    expect(birthdayValue(2, 29, 1990)).toBeNull();
    expect(birthdayValue(4, 31)).toBeNull();
    expect(birthdayValue(13, 1)).toBeNull();
    expect(birthdayValue(1, 0)).toBeNull();
    expect(birthdayValue(1, 1, 1800)).toBeNull();
    expect(birthdayValue(1, 1, new Date().getFullYear() + 1)).toBeNull();
  });

  test("shown as words", () => {
    expect(formatBirthday("03-14")).toBe("March 14");
    expect(formatBirthday("1990-12-01")).toBe("December 1, 1990");
  });

  test("aboutProblem checks lengths and the birthday", () => {
    expect(aboutProblem(EMPTY_ABOUT)).toBeNull();
    expect(aboutProblem({ ...EMPTY_ABOUT, church: "x".repeat(81) })).not.toBeNull();
    expect(aboutProblem({ ...EMPTY_ABOUT, birthday: "02-30" })).not.toBeNull();
  });
});
