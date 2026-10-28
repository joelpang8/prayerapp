import { describe, expect, test } from "vitest";
import { filterFriends } from "../../src/lib/friendFilter";

const profiles = new Map([
  ["a", { displayName: "José Martínez", username: "jmart" }],
  ["b", { displayName: "Grace Lee", username: "gracel" }],
  ["c", { displayName: "Sam Ortiz", username: "samo" }],
]);
const uids = ["a", "b", "c", "d"]; // "d" hasn't loaded yet

describe("searching my friends", () => {
  test("an empty search keeps everyone, in order", () => {
    expect(filterFriends(uids, profiles, "  ")).toEqual(["a", "b", "c", "d"]);
  });

  test("matches names and usernames, ignoring case and accents", () => {
    expect(filterFriends(uids, profiles, "jose")).toEqual(["a"]);
    expect(filterFriends(uids, profiles, "MARTÍNEZ")).toEqual(["a"]);
    expect(filterFriends(uids, profiles, "@gracel")).toEqual(["b"]);
    expect(filterFriends(uids, profiles, "or")).toEqual(["c"]);
  });

  test("no match is an empty list; unloaded profiles never match", () => {
    expect(filterFriends(uids, profiles, "zzz")).toEqual([]);
    expect(filterFriends(uids, profiles, "d")).toEqual([]);
  });
});
