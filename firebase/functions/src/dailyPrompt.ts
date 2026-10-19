/**
 * The daily prompt: one global moment a day (v1, everyone at once), picked
 * at random inside 08:00–21:00 America/New_York, kept secret on the server
 * until it fires, then sent to every subscribed phone with one FCM topic
 * push (no per-user push tokens are stored).
 *
 * Pure parts, tested without the cloud. Ported from the step 4 prototype
 * after it was proven on an iPhone (the prototype has since been removed).
 */
import { randomInt } from "node:crypto";
import type { TopicMessage } from "firebase-admin/messaging";
import verseList from "./verse-list.json";

/** Decided: the same window every day (docs/decisions.md). */
export const PROMPT_WINDOW = { timeZone: "America/New_York", earliest: "08:00", latest: "21:00" } as const;
/** Every phone subscribes to this topic (app/src/lib/push.ts). */
export const PROMPT_TOPIC = "prompt";

export const WINDOW_MS = 2 * 60 * 1000; // respond "right now"
export const GRACE_MS = 5 * 60 * 1000; // still on time; must match the app and the rules (7 minutes)
/** A "pray now" alert hours later is noise: after an hour it's dropped. */
export const PUSH_TTL_MS = 60 * 60 * 1000;

export type DailyWindow = { timeZone: string; earliest: string; latest: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `timeZone`; a spring-forward gap moves forward. */
export function zonedToUtc(dateKey: string, hhmm: string, timeZone: string): Date {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(dateKey);
  const t = HHMM.exec(hhmm);
  if (!d || !t) throw new Error(`bad date/time: ${dateKey} ${hhmm}`);
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const first = naive - zoneOffsetMs(naive, timeZone);
  const second = naive - zoneOffsetMs(first, timeZone);
  if (zoneOffsetMs(second, timeZone) === zoneOffsetMs(first, timeZone)) return new Date(Math.min(first, second));
  return new Date(Math.max(first, second));
}

/** "20261003": the calendar date of `instant` in `timeZone`. Also the prompt's id. */
export function dateKeyIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

/** A uniformly random second inside the day's window, from a cryptographic RNG. */
export function pickFireTime(dateKey: string, w: DailyWindow = PROMPT_WINDOW, rand: (maxExclusive: number) => number = randomInt): Date {
  if (!HHMM.test(w.earliest) || !HHMM.test(w.latest) || w.earliest >= w.latest) throw new Error("bad window");
  const start = zonedToUtc(dateKey, w.earliest, w.timeZone).getTime();
  const end = zonedToUtc(dateKey, w.latest, w.timeZone).getTime();
  return new Date(start + rand(Math.floor((end - start) / 1000)) * 1000);
}

/** When the day's window closes; a planner running later than this skips the day. */
export function windowEnd(dateKey: string, w: DailyWindow = PROMPT_WINDOW): Date {
  return zonedToUtc(dateKey, w.latest, w.timeZone);
}

/**
 * The day's verse: the curated list in order, one per calendar day. Uses the
 * date itself, so it's the same whenever in the day it's asked.
 */
export function verseForDate(dateKey: string, verses: readonly string[] = verseList.verses): string | null {
  if (!verses.length) return null;
  const day = Math.floor(Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8))) / 86_400_000);
  return verses[((day % verses.length) + verses.length) % verses.length];
}

/** The push: proven on an iPhone in the prototype; only the topic and Android channel differ. */
export function buildPromptMessage(opts: { promptId: string; firedAt: Date; verseRef?: string | null; topic?: string }): TopicMessage {
  const expiresAt = Math.floor((opts.firedAt.getTime() + PUSH_TTL_MS) / 1000);
  return {
    topic: opts.topic ?? PROMPT_TOPIC,
    notification: {
      title: "Time to pray",
      body: "Pause and pray right now. You have 2 minutes.",
    },
    // The countdown runs from the server's firedAt, not from arrival.
    data: {
      kind: "prompt",
      promptId: opts.promptId,
      firedAt: opts.firedAt.toISOString(),
      windowMs: String(WINDOW_MS),
      graceMs: String(GRACE_MS),
      ...(opts.verseRef ? { verseRef: opts.verseRef } : {}),
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-expiration": String(expiresAt),
        "apns-collapse-id": `prompt-${opts.promptId}`,
      },
      payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } },
    },
    android: {
      priority: "high",
      ttl: PUSH_TTL_MS,
      collapseKey: `prompt-${opts.promptId}`,
      // The app's high-importance channel (app/src/lib/notifications.ts PROMPT_CHANNEL).
      notification: { tag: `prompt-${opts.promptId}`, channelId: "prompt" },
    },
  };
}
