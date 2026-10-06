// Development only: sends today's prompt in the local emulators.
//
//   npm run dev:prompt                        # prompt fires now, with the next curated verse
//   npm run dev:prompt -- --minutes-ago 10    # fired 10 min ago (posts will be late)
//   npm run dev:prompt -- --verse JHN.3.16    # a specific canonical reference id
//   npm run dev:prompt -- --no-verse          # no verse
//   npm run dev:prompt -- --no-notify         # don't show a Simulator notification
//
// On a Mac it also drops a "Time to pray" notification into the booted iOS
// Simulator (xcrun simctl push), as the real push will. The app must have
// notifications turned on. Bundle id: --bundle-id, else IOS_BUNDLE_ID from
// app/.env, else com.example.prayerapp.
//
// In production, prompts are sent by the step 4 scheduler (not built yet).
// This script refuses to run unless it's pointed at the Firestore emulator.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// The Simulator notification. Same words as the real push (notify-proto's
// message.ts); a prompt sent "minutes ago" says so instead.
if (process.platform === "darwin" && !process.argv.includes("--no-notify")) {
  const b = process.argv.indexOf("--bundle-id");
  const envFile = new URL("../../app/.env", import.meta.url);
  const fromEnv = existsSync(envFile) ? /^IOS_BUNDLE_ID=(\S+)/m.exec(readFileSync(envFile, "utf8"))?.[1] : undefined;
  const bundleId = b > 0 ? process.argv[b + 1] : fromEnv || "com.example.prayerapp";
  const body = minutesAgo > 0
    ? `The prompt went out ${minutesAgo} min ago. You can still pray and post.`
    : "Pause and pray right now. You have 2 minutes.";
  const payload = {
    aps: { alert: { title: "Time to pray", body }, sound: "default", "thread-id": `prompt-${id}` },
    kind: "prompt",
    promptId: id,
    firedAt: firedAt.toISOString(),
  };
  const file = join(mkdtempSync(join(tmpdir(), "prompt-")), "prompt.apns");
  writeFileSync(file, JSON.stringify(payload));
  try {
    execFileSync("xcrun", ["simctl", "push", "booted", bundleId, file], { stdio: "pipe" });
    console.log(`Notification sent to the Simulator (${bundleId}).`);
  } catch (err) {
    const detail = String(err.stderr ?? err.message);
    if (/not authorized|code=2003/.test(detail)) {
      // iOS 27+ refuses (UNErrorDomain 2003) until the app itself has asked.
      console.log("No Simulator notification: the app hasn't asked for notification permission yet.");
      console.log('In the app, tap "Turn on notifications" on Today, then Allow, and run this again.');
    } else {
      console.log(`No Simulator notification: ${detail.trim().split("\n")[0]}`);
      console.log("Is the Simulator running with the app installed? (--no-notify skips this.)");
    }
  }
}
