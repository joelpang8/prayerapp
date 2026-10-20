import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { RESPOND_WINDOW_MS } from "../../src/lib/posts";
import { setCurrentLang } from "../../src/i18n";
import { justFinishedProfile, tutorialPages } from "../../src/lib/tutorial";

const TUTORIAL_PAGES = tutorialPages();

describe("How PrayAlong works", () => {
  test("three short pages: the daily moment, friends only, private", () => {
    expect(TUTORIAL_PAGES.map((p) => p.title)).toEqual(["One moment a day", "Only your friends", "Some prayers are just for you"]);
    for (const p of TUTORIAL_PAGES) expect(p.body.length).toBeLessThan(320);
  });

  test("the daily moment says the real time to pray", () => {
    expect(TUTORIAL_PAGES[0].body).toContain(`${RESPOND_WINDOW_MS / 60_000} minutes`);
  });

  test("gentle wording: no scores, streaks or 'missed'", () => {
    for (const p of TUTORIAL_PAGES) expect(`${p.title} ${p.body}`).not.toMatch(/miss|streak|goal|score|fail/i);
  });

  test("in Spanish too: three pages, the real time, gentle wording", () => {
    setCurrentLang("es");
    try {
      const pages = tutorialPages();
      expect(pages.map((p) => p.title)).toEqual(["Un momento al día", "Solo tus amigos", "Algunas oraciones son solo para ti"]);
      expect(pages[0].body).toContain(`${RESPOND_WINDOW_MS / 60_000} minutos`);
      for (const p of pages) {
        expect(p.body.length).toBeLessThan(340);
        expect(`${p.title} ${p.body}`).not.toMatch(/perdiste|racha|meta|puntuaci|fallaste/i);
      }
    } finally {
      setCurrentLang("en");
    }
  });

  test("shown once, only to a brand-new account", () => {
    expect(justFinishedProfile("needsProfile", "ready")).toBe(true);
    // Signing in to an existing account, or starting the app signed in, doesn't show it.
    expect(justFinishedProfile("signedOut", "ready")).toBe(false);
    expect(justFinishedProfile(null, "ready")).toBe(false);
    expect(justFinishedProfile("ready", "ready")).toBe(false);
  });

  test("nothing about it is stored", () => {
    const src = readFileSync("src/lib/tutorial.ts", "utf8") + readFileSync("src/app/welcome.tsx", "utf8");
    expect(src).not.toMatch(/AsyncStorage|setDoc|updateDoc|SecureStore/);
  });
});
