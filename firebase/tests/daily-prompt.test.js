import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp } from "firebase/firestore";
import {
  buildPromptMessage, dateKeyIn, GRACE_MS, pickFireTime, PROMPT_TOPIC, PROMPT_WINDOW, PUSH_TTL_MS,
  verseForDate, WINDOW_MS, windowEnd, zonedToUtc,
} from "../functions/lib/dailyPrompt.js";
import verseList from "../functions/src/verse-list.json" with { type: "json" };
import { seed, setupEnv, signedInAs } from "./helpers.js";

// The daily prompt: planner, secret schedule, firing, push.
const e2e = (name, fn) => test.skipIf(process.env.SKIP_CROSS_SERVICE === "1")(name, fn, 60000);

describe("picking the day's moment (unit)", () => {
  test("the window is 08:00–21:00 New York, the same every day", () => {
    expect(PROMPT_WINDOW).toEqual({ timeZone: "America/New_York", earliest: "08:00", latest: "21:00" });
  });

  test("always inside the window, including across both clock changes", () => {
    for (const day of ["20260308", "20260715", "20261101", "20261225"]) {
      const start = zonedToUtc(day, "08:00", "America/New_York").getTime();
      const end = windowEnd(day).getTime();
      expect(pickFireTime(day, PROMPT_WINDOW, () => 0).getTime()).toBe(start);
      expect(pickFireTime(day, PROMPT_WINDOW, (max) => max - 1).getTime()).toBeLessThan(end);
      for (let i = 0; i < 200; i++) {
        const t = pickFireTime(day).getTime();
        expect(t >= start && t < end).toBe(true);
      }
    }
    // Winter vs summer offset.
    expect(zonedToUtc("20261225", "08:00", "America/New_York").toISOString()).toBe("2026-12-25T13:00:00.000Z");
    expect(zonedToUtc("20260715", "08:00", "America/New_York").toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  test("wall-clock times in any zone, across daylight saving (ported from the prototype)", () => {
    expect(zonedToUtc("20260308", "02:30", "America/Chicago").toISOString()).toBe("2026-03-08T08:30:00.000Z"); // nonexistent -> 03:30 CDT
    expect(zonedToUtc("20261101", "01:30", "America/Chicago").toISOString()).toBe("2026-11-01T06:30:00.000Z"); // repeated hour: first occurrence
    expect(zonedToUtc("20260715", "09:00", "Europe/London").toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(zonedToUtc("20260715", "09:00", "UTC").toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  test("bad windows are rejected", () => {
    expect(() => pickFireTime("20260715", { ...PROMPT_WINDOW, earliest: "21:00", latest: "08:00" })).toThrow();
    expect(() => pickFireTime("20260715", { ...PROMPT_WINDOW, earliest: "8:00" })).toThrow();
    expect(() => pickFireTime("2026-07-15", PROMPT_WINDOW)).toThrow();
  });

  test("spread across the whole window, not clustered", () => {
    const start = zonedToUtc("20260715", "08:00", "America/New_York").getTime();
    const hours = new Set();
    for (let i = 0; i < 500; i++) hours.add(Math.floor((pickFireTime("20260715").getTime() - start) / 3_600_000));
    expect(hours.size).toBe(13);
  });

  test("the prompt id is the New York date", () => {
    expect(dateKeyIn(new Date("2026-10-19T03:30:00Z"), "America/New_York")).toBe("20261018");
    expect(dateKeyIn(new Date("2026-10-19T04:30:00Z"), "America/New_York")).toBe("20261019");
  });

  test("the day's verse: the curated list in order, one per day, the same all day", () => {
    const v = verseList.verses;
    expect(v.length).toBeGreaterThan(0);
    const a = verseForDate("20261019");
    expect(v).toContain(a);
    expect(verseForDate("20261020")).toBe(v[(v.indexOf(a) + 1) % v.length]);
    expect(verseForDate("20261019", [])).toBeNull();
  });
});

describe("the push (unit)", () => {
  const firedAt = new Date("2026-10-19T18:31:07Z");
  const m = buildPromptMessage({ promptId: "20261019", firedAt, verseRef: "PSA.145.18" });

  test("goes to the app's topic with the server's firedAt and the 2 + 5 minute window", () => {
    expect(m.topic).toBe(PROMPT_TOPIC);
    expect(m.data).toEqual({
      kind: "prompt", promptId: "20261019", firedAt: "2026-10-19T18:31:07.000Z",
      windowMs: String(WINDOW_MS), graceMs: String(GRACE_MS), verseRef: "PSA.145.18",
    });
    expect(WINDOW_MS + GRACE_MS).toBe(7 * 60 * 1000);
  });

  test("iOS: immediate, time-sensitive, expires after an hour, no duplicates", () => {
    expect(m.apns.headers).toMatchObject({ "apns-priority": "10", "apns-push-type": "alert", "apns-collapse-id": "prompt-20261019" });
    expect(Number(m.apns.headers["apns-expiration"])).toBe(Math.floor((firedAt.getTime() + PUSH_TTL_MS) / 1000));
    expect(m.apns.payload.aps["interruption-level"]).toBe("time-sensitive");
  });

  test("Android: high priority on the app's prompt channel", () => {
    expect(m.android).toMatchObject({ priority: "high", ttl: PUSH_TTL_MS, collapseKey: "prompt-20261019" });
    expect(m.android.notification.channelId).toBe("prompt");
  });

  test("never contains verse text or anything personal", () => {
    expect(JSON.stringify(m)).not.toMatch(/nigh|uid|email|displayName/i);
  });
});

describe("the daily prompt in the emulators", () => {
  let env;
  beforeAll(async () => { env = await setupEnv(); });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });

  test("the schedule is secret: no client can read, list or write it", async () => {
    await seed(env, (db) => setDoc(doc(db, "promptSchedule", "20261019"), { fireAt: Timestamp.now(), verseRef: "PSA.145.18" }));
    const db = signedInAs(env, "alice");
    await assertFails(getDoc(doc(db, "promptSchedule", "20261019")));
    await assertFails(getDocs(collection(db, "promptSchedule")));
    await assertFails(setDoc(doc(db, "promptSchedule", "20261020"), { fireAt: Timestamp.now() }));
    // Prompts themselves stay readable to signed-in users, written only by the server.
    await assertFails(setDoc(doc(db, "prompts", "20261020"), { firedAt: Timestamp.now() }));
  });

  async function waitFor(path, check, ms = 45000) {
    let data;
    const start = Date.now();
    while (Date.now() - start < ms) {
      await seed(env, async (db) => { data = (await getDoc(doc(db, ...path.split("/")))).data(); });
      if (check(data)) return data;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${path} never matched: ${JSON.stringify(data)}`);
  }

  e2e("at the chosen moment, not before: the prompt is created with its verse and the push is sent once", async () => {
    const day = "20990101";
    const fireAt = new Date(Date.now() + 8000);
    await seed(env, (db) => setDoc(doc(db, "promptSchedule", day), { fireAt: Timestamp.fromDate(fireAt), verseRef: "PSA.145.18" }));
    const schedule = await waitFor(`promptSchedule/${day}`, (d) => !!d?.sentAt);
    expect(schedule).toMatchObject({ messageId: "emulator-dry-run", attempts: 1 });
    expect(schedule.firedAt.toMillis()).toBeGreaterThanOrEqual(fireAt.getTime());
    expect(schedule.firedAt.toMillis() - fireAt.getTime()).toBeLessThan(5000);
    const prompt = await waitFor(`prompts/${day}`, (d) => !!d);
    expect(prompt).toEqual({ firedAt: schedule.firedAt, verseRef: "PSA.145.18" });
    // The app's own listener sees it (prompts are readable to signed-in users).
    await assertSucceeds(getDoc(doc(signedInAs(env, "alice"), "prompts", day)));
  });

  e2e("a prompt already sent by hand that day is left alone, and no push goes out", async () => {
    const day = "20990102";
    const manual = Timestamp.fromDate(new Date(Date.now() - 3600_000));
    await seed(env, (db) => setDoc(doc(db, "prompts", day), { firedAt: manual, verseRef: "JHN.3.16" }));
    await seed(env, (db) => setDoc(doc(db, "promptSchedule", day), { fireAt: Timestamp.fromDate(new Date(Date.now() - 1000)), verseRef: "PSA.145.18" }));
    const schedule = await waitFor(`promptSchedule/${day}`, (d) => !!d?.skipped);
    expect(schedule.sentAt).toBeUndefined();
    expect(await waitFor(`prompts/${day}`, (d) => !!d)).toEqual({ firedAt: manual, verseRef: "JHN.3.16" });
  });
});
