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
  test("the web page opens the app with the same links the app reads", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("../firebase/hosting/join.html", "utf8");
    expect(page).toContain('"prayerapp://circle-join/" + value');
    expect(page).toContain('"prayerapp://u/" + value');
    // A picture for the link preview in Messages, and one that exists.
    expect(page).toContain('property="og:image" content="https://prayerapp-4ce99.web.app/invite-card.png"');
    expect(readFileSync("../firebase/hosting/invite-card.png").length).toBeGreaterThan(1000);
    const hosting = JSON.parse(readFileSync("../firebase/firebase.json", "utf8")).hosting;
    expect(hosting.rewrites).toEqual(expect.arrayContaining([{ source: "/c/**", destination: "/join.html" }, { source: "/u/**", destination: "/join.html" }]));
  });

  test("the link carries the code and reads back", () => {
    expect(circleLinkUrl(CODE)).toBe(`https://prayerapp-4ce99.web.app/c/${CODE}`);
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
