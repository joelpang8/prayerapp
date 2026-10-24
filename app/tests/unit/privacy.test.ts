import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PRIVACY_URL } from "../../src/lib/links";

const page = readFileSync("../firebase/hosting/privacy/index.html", "utf8");
const hosting = JSON.parse(readFileSync("../firebase/firebase.json", "utf8")).hosting;

test("the privacy policy is published with Firebase Hosting at the app's link", () => {
  expect(hosting.public).toBe("hosting");
  expect(hosting.cleanUrls).toBe(true);
  expect(PRIVACY_URL).toBe("https://prayerapp-4ce99.web.app/privacy");
});

test("it's linked from Settings and from sign-in", () => {
  expect(readFileSync("src/app/(tabs)/settings.tsx", "utf8")).toContain("onPress={openPrivacyPolicy}");
  expect(readFileSync("src/app/sign-in.tsx", "utf8")).toContain("onPress={openPrivacyPolicy}");
});

test("it states the publisher, contact, and how to delete an account", () => {
  expect(page).toContain("published by Joel Pang");
  expect(page).toContain("mailto:j.pang3248@gmail.com");
  expect(page).toContain("Settings → Delete account");
  // Promises the app keeps: town-level place only, no ads or tracking.
  expect(page).toContain("never your exact location");
  expect(page).toMatch(/no ads and no analytics or tracking tools/);
});
