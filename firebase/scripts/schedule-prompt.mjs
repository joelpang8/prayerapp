// Schedules today's prompt for a few minutes from now on the real project, to
// test the daily prompt end to end (Cloud Task -> prompt -> push) without
// waiting for tomorrow's random moment. Uses the same server path as the
// daily planner: it only writes promptSchedule/{today}; firePrompt does the rest.
//
//   node scripts/schedule-prompt.mjs --project prayerapp-4ce99 --in 2         # shows what it would do
//   node scripts/schedule-prompt.mjs --project prayerapp-4ce99 --in 2 --yes   # does it
//
// Refuses if today already has a schedule or a prompt (one prompt a day).
// Uses your own login (gcloud auth application-default login).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dateKeyIn, verseForDate, PROMPT_WINDOW } = require("../functions/lib/dailyPrompt.js");

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const project = arg("project");
const minutes = Number(arg("in") ?? 2);
if (!project) { console.error("Pass --project <id>."); process.exit(1); }
if (!(minutes >= 0 && minutes <= 120)) { console.error("--in takes minutes from now, 0 to 120."); process.exit(1); }

const fireAt = new Date(Date.now() + minutes * 60_000);
const day = dateKeyIn(fireAt, PROMPT_WINDOW.timeZone);
const verseRef = verseForDate(day);
const summary = `today's prompt (${day}) at ${fireAt.toLocaleTimeString()} with ${verseRef ?? "no verse"}`;
if (!process.argv.includes("--yes")) {
  console.log(`Would schedule ${summary} on ${project}. Everyone subscribed gets the push. Add --yes.`);
  process.exit(0);
}

const db = getFirestore(initializeApp({ projectId: project }));
if ((await db.doc(`prompts/${day}`).get()).exists) {
  console.error(`Prompt ${day} was already sent today (one a day). Try again tomorrow.`);
  process.exit(1);
}
try {
  await db.doc(`promptSchedule/${day}`).create({ fireAt: Timestamp.fromDate(fireAt), verseRef, createdAt: Timestamp.now(), manual: true });
} catch (err) {
  if (err.code === 6) {
    console.error(`Today (${day}) is already scheduled by the daily planner; it will fire at its own random moment.`);
    process.exit(1);
  }
  throw err;
}
console.log(`Scheduled ${summary}. Watch your phone.`);
process.exit(0);
