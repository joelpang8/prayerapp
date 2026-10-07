import { expect, test, vi } from "vitest";

// Stand-in for expo-linking with the same URL parsing it does for custom schemes.
vi.mock("expo-linking", () => ({
  createURL: (path: string) => `prayerapp://${path}`,
  parse: (url: string) => {
    const u = new URL(url);
    return { hostname: u.hostname || null, path: u.pathname.replace(/^\/+/, "") || null };
  },
}));
vi.mock("react-native", () => ({ Share: {} }));
const { inviteLink, inviteMessage, usernameFromLink } = await import("../../src/lib/invite");

test("invite links carry the username, and are read back", () => {
  expect(inviteLink("joel_p")).toBe("prayerapp://u/joel_p");
  expect(inviteMessage("joel_p")).toContain("@joel_p");
  expect(usernameFromLink("prayerapp://u/joel_p")).toBe("joel_p");
  expect(usernameFromLink("prayerapp://u/Joel_P")).toBe("joel_p");
});

test("anything else isn't an invite", () => {
  expect(usernameFromLink(null)).toBeNull();
  expect(usernameFromLink("prayerapp://post/abc")).toBeNull();
  expect(usernameFromLink("prayerapp://u/")).toBeNull();
  expect(usernameFromLink("prayerapp://u/no!")).toBeNull();
});
