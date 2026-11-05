import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { appPathFor } from "../../src/lib/deepLinks";

test("links from the widget, Siri and invites open real screens", () => {
  expect(appPathFor("prayerapp://prayers")).toBe("/prayers");
  expect(appPathFor("prayerapp:///prayers")).toBe("/prayers");
  expect(appPathFor("/prayers")).toBe("/prayers");
  expect(appPathFor("prayers")).toBe("/prayers");
  expect(appPathFor("prayerapp://prayer-list/edit?name=Grandpa%20Joe")).toBe("/prayer-list/edit?name=Grandpa%20Joe");
  expect(appPathFor("prayerapp://circle-join/AbCdEfGhIjKlMnOpQrStUvWx")).toBe("/circle-join/AbCdEfGhIjKlMnOpQrStUvWx");
  expect(appPathFor("prayerapp://u/joel_p")).toBe("/u/joel_p");
  expect(appPathFor("prayerapp://pray")).toBe("/pray");
  expect(appPathFor("prayerapp://")).toBe("/");
  expect(appPathFor("exp+prayerapp://--/prayers")).toBe("/prayers");
});

test("anything else goes to Today, never an error page", () => {
  expect(appPathFor("prayerapp://nothing-here")).toBe("/");
  expect(appPathFor("prayerapp://widget?kind=PrayForWidget")).toBe("/");
  expect(readFileSync("src/app/+not-found.tsx", "utf8")).toContain('<Redirect href="/" />');
  expect(readFileSync("src/app/+native-intent.tsx", "utf8")).toContain("appPathFor(path)");
});

test("every route folder or screen is known (so new screens aren't sent to Today)", () => {
  const src = readFileSync("src/lib/deepLinks.ts", "utf8");
  for (const name of ["prayers", "circles", "prayer-list", "circle-join", "settings", "activity"]) expect(src).toContain(`"${name}"`);
});
