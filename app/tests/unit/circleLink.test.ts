import { describe, expect, test, vi } from "vitest";

// Stand-in for expo-linking with the same URL parsing it does for custom schemes.
vi.mock("expo-linking", () => ({
  createURL: (path: string) => `prayerapp://${path}`,
  parse: (url: string) => {
    const u = new URL(url);
    return { hostname: u.hostname || null, path: u.pathname.replace(/^\/+/, "") || null };
  },
}));
vi.mock("react-native", () => ({ Share: {} }));
const { circleCodeFromLink, circleLinkUrl } = await import("../../src/lib/circleLink");

const CODE = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("circle invite links", () => {
  test("the link carries the code and reads back", () => {
    expect(circleLinkUrl(CODE)).toContain(`circle-join/${CODE}`);
    expect(circleCodeFromLink(`prayerapp://circle-join/${CODE}`)).toBe(CODE);
    expect(circleCodeFromLink(circleLinkUrl(CODE))).toBe(CODE);
  });

  test("anything else isn't a circle link", () => {
    expect(circleCodeFromLink("prayerapp://u/sam")).toBeNull();
    expect(circleCodeFromLink("prayerapp://circle-join/short")).toBeNull();
    expect(circleCodeFromLink("prayerapp://circle-join/../../x")).toBeNull();
    expect(circleCodeFromLink(null)).toBeNull();
  });
});
