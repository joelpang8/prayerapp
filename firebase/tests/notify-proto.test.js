import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { buildPromptMessage, GRACE_MS, PUSH_TTL_MS, WINDOW_MS } from "../notify-proto/lib/message.js";
import { dateKeyIn, pickFireTime, validateWindow, zonedToUtc } from "../notify-proto/lib/schedule.js";
import { seed, setupEnv, signedInAs } from "./helpers.js";

const e2e = (name, fn) => test.skipIf(process.env.SKIP_CROSS_SERVICE === "1")(name, fn, 60000);

describe("picking the daily moment (unit)", () => {
  const w = { timeZone: "America/Chicago", earliest: "08:00", latest: "21:00" };

  test("wall-clock times convert to the right UTC instant, across DST", () => {
    expect(zonedToUtc("20260115", "08:00", "America/Chicago").toISOString()).toBe("2026-01-15T14:00:00.000Z"); // CST
    expect(zonedToUtc("20260715", "08:00", "America/Chicago").toISOString()).toBe("2026-07-15T13:00:00.000Z"); // CDT
    expect(zonedToUtc("20260308", "02:30", "America/Chicago").toISOString()).toBe("2026-03-08T08:30:00.000Z"); // nonexistent -> 03:30 CDT
    expect(zonedToUtc("20261101", "08:00", "America/Chicago").toISOString()).toBe("2026-11-01T14:00:00.000Z"); // day DST ends
    expect(zonedToUtc("20261101", "01:30", "America/Chicago").toISOString()).toBe("2026-11-01T06:30:00.000Z"); // repeated hour: first (CDT) occurrence
    expect(zonedToUtc("20260715", "09:00", "Europe/London").toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(zonedToUtc("20260715", "09:00", "UTC").toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  test("always inside the window, at both extremes of the random range", () => {
    const start = zonedToUtc("20260715", "08:00", w.timeZone).getTime();
    const end = zonedToUtc("20260715", "21:00", w.timeZone).getTime();
    expect(pickFireTime("20260715", w, () => 0).getTime()).toBe(start);
    const last = pickFireTime("20260715", w, (max) => max - 1).getTime();
    expect(last).toBeLessThan(end);
    expect(last).toBeGreaterThan(end - 2000);
    for (let i = 0; i < 500; i++) {
      const t = pickFireTime("20260715", w).getTime();
      expect(t >= start && t < end).toBe(true);
    }
  });

  test("random across the window, not clustered", () => {
    const start = zonedToUtc("20260715", "08:00", w.timeZone).getTime();
    const hours = new Set();
    for (let i = 0; i < 400; i++) hours.add(Math.floor((pickFireTime("20260715", w).getTime() - start) / 3_600_000));
    expect(hours.size).toBe(13); // every hour of 08:00–21:00 gets hit
  });

  test("date key in the window's zone", () => {
    expect(dateKeyIn(new Date("2026-07-16T03:00:00Z"), "America/Chicago")).toBe("20260715");
    expect(dateKeyIn(new Date("2026-07-16T03:00:00Z"), "UTC")).toBe("20260716");
  });

  test("bad windows are rejected", () => {
    expect(() => validateWindow({ ...w, earliest: "21:00", latest: "08:00" })).toThrow();
    expect(() => validateWindow({ ...w, earliest: "8:00" })).toThrow();
    expect(() => validateWindow({ ...w, timeZone: "Mars/Olympus" })).toThrow();
  });
});

describe("the push message (unit)", () => {
  const firedAt = new Date("2026-07-15T18:31:07Z");
  const m = buildPromptMessage({ topic: "proto-prompt", promptId: "20260715", firedAt, verseRef: "PHP.4.6-7" });

  test("carries the server's firedAt and the window, so the countdown doesn't depend on arrival time", () => {
    expect(m.data).toEqual({
      kind: "prompt", promptId: "20260715", firedAt: "2026-07-15T18:31:07.000Z",
      windowMs: String(WINDOW_MS), graceMs: String(GRACE_MS), verseRef: "PHP.4.6-7",
    });
    expect(WINDOW_MS + GRACE_MS).toBe(7 * 60 * 1000); // must match ON_TIME_WINDOW_MS in the app and the rules' 7 minutes
  });

  test("iOS: immediate, time-sensitive, expires after an hour, collapses duplicates", () => {
    expect(m.apns.headers["apns-priority"]).toBe("10");
    expect(m.apns.payload.aps["interruption-level"]).toBe("time-sensitive");
    expect(Number(m.apns.headers["apns-expiration"])).toBe(Math.floor((firedAt.getTime() + PUSH_TTL_MS) / 1000));
    expect(m.apns.headers["apns-collapse-id"]).toBe("prompt-20260715");
  });

  test("Android: high priority, same TTL, same collapse key", () => {
    expect(m.android).toMatchObject({ priority: "high", ttl: PUSH_TTL_MS, collapseKey: "prompt-20260715" });
  });

  test("never contains verse text or anything personal", () => {
    expect(JSON.stringify(m)).not.toMatch(/careful|uid|email/i);
  });
});

describe("prototype runs in the emulators", () => {
  let env;
  beforeAll(async () => { env = await setupEnv(); });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });

  test("protoRuns is closed to clients", async () => {
    const db = signedInAs(env, "alice");
    await assertFails(getDoc(doc(db, "protoRuns", "x")));
    await assertFails(getDocs(collection(db, "protoRuns")));
    await assertFails(setDoc(doc(db, "protoRuns", "x"), { fireAt: Timestamp.now() }));
  });

  async function run(id, fireAt) {
    await seed(env, (db) => setDoc(doc(db, "protoRuns", id), { fireAt: Timestamp.fromDate(fireAt), verseRef: "PHP.4.6-7" }));
    let data;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      await seed(env, async (db) => { data = (await getDoc(doc(db, "protoRuns", id))).data(); });
      if (data?.sentAt) return data;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`run ${id} never sent: ${JSON.stringify(data)}`);
  }

  e2e("a run fires at its scheduled moment, not before, and sends once", async () => {
    const fireAt = new Date(Date.now() + 8000);
    const data = await run("sched1", fireAt);
    const firedMs = data.firedAt.toMillis();
    expect(firedMs).toBeGreaterThanOrEqual(fireAt.getTime()); // never early
    expect(firedMs - fireAt.getTime()).toBeLessThan(5000);
    expect(data).toMatchObject({ messageId: "emulator-dry-run", attempts: 1 });
    expect(data.enqueuedAt).toBeTruthy();
  });

  e2e("a run whose moment has passed fires right away", async () => {
    const data = await run("past1", new Date(Date.now() - 60000));
    expect(data.attempts).toBe(1);
  });
});
