// Development only: sends today's prompt in the local emulators.
//
//   npm run dev:prompt                        # prompt fires now, with the next curated verse
//   npm run dev:prompt -- --minutes-ago 10    # fired 10 min ago (posts will be late)
//   npm run dev:prompt -- --verse JHN.3.16    # a specific canonical reference id
//   npm run dev:prompt -- --no-verse          # no verse
//
// In production, prompts are sent by the step 4 scheduler (not built yet).
// This script refuses to run unless it's pointed at the Firestore emulator.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
  console.error(`Refusing: FIRESTORE_EMULATOR_HOST=${host} is not a local emulator.`);
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST = host;

const i = process.argv.indexOf("--minutes-ago");
const minutesAgo = i > 0 ? Number(process.argv[i + 1]) : 0;
const firedAt = new Date(Date.now() - minutesAgo * 60_000);
const id = firedAt.toISOString().slice(0, 10).replaceAll("-", "");

// Verse: like the step 4 scheduler will, take the curated list in order
// (one per day), unless overridden. The list is validated by `npm run verses`
// in app/; here we only check the id shape.
const { verses } = JSON.parse(readFileSync(new URL("../functions/src/verse-list.json", import.meta.url), "utf8"));
const v = process.argv.indexOf("--verse");
const day = Math.floor(firedAt.getTime() / 86_400_000);
const verseRef = process.argv.includes("--no-verse") ? null : v > 0 ? process.argv[v + 1] : verses[day % verses.length];
if (verseRef && !/^[1-3]?[A-Z]{2,3}\.\d{1,3}(\.\d{1,3}(-\d{1,3}(\.\d{1,3})?)?)?$/.test(verseRef)) {
  console.error(`"${verseRef}" is not a canonical reference id (e.g. PHP.4.6-7).`);
  process.exit(1);
}

initializeApp({ projectId: "demo-prayerapp" });
await getFirestore().doc(`prompts/${id}`).set({ firedAt: Timestamp.fromDate(firedAt), ...(verseRef ? { verseRef } : {}) });
console.log(`Prompt ${id} fired at ${firedAt.toLocaleTimeString()}${verseRef ? ` with ${verseRef}` : ""}`);
