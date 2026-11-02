import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { feedbackMail, FEEDBACK_EMAIL } from "../../src/lib/feedback";
import { shouldShowWhatsNew, WHATS_NEW } from "../../src/lib/whatsNew";

describe("What's new", () => {
  const before = new Date("2026-09-01T12:00:00Z");
  const after = new Date(`${WHATS_NEW.id}T15:00:00Z`);

  test("shown once to people who had the app before these notes", () => {
    expect(shouldShowWhatsNew(null, before)).toBe(true);
    expect(shouldShowWhatsNew("2026-10-01", before)).toBe(true);
    expect(shouldShowWhatsNew(WHATS_NEW.id, before)).toBe(false);
  });

  test("never to a brand-new account (nothing changed for them)", () => {
    expect(shouldShowWhatsNew(null, after)).toBe(false);
  });

  test("every item has wording in both languages", async () => {
    const { default: strings } = await import("../../src/i18n/strings/common");
    for (const key of WHATS_NEW.items) {
      expect(strings.en[key as keyof typeof strings.en], key).toBeTruthy();
      expect(strings.es[key as keyof typeof strings.es], key).toBeTruthy();
    }
  });
});

describe("Send feedback", () => {
  test("an email to the address in the privacy policy, with only the app and system versions", () => {
    const url = feedbackMail({ version: "0.1.0", build: "42", system: "iOS 19.1" });
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(url)).toContain("PrayAlong 0.1.0 (build 42), iOS 19.1");
    expect(readFileSync("../firebase/hosting/privacy/index.html", "utf8")).toContain(FEEDBACK_EMAIL);
  });
});
