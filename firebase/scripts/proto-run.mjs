// STEP 4 PROTOTYPE: schedule one test prompt and report each stage's timing.
//
//   node scripts/proto-run.mjs --project prayerapp-4ce99 --in 90      # fire in 90 s
//   node scripts/proto-run.mjs --emulator --in 10                     # local emulators
//
// Uses your own Google login (gcloud auth application-default login); no
// extra IAM role needed. Writes protoRuns/{id}, which only the Admin SDK can
// write (clients are denied by firestore.rules). notify-proto schedules a
// Cloud Task for that moment, then sends one push to the "proto-prompt" topic.
// Devices running the prototype app and subscribed to the topic get it.
import { randomBytes } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const emulator = process.argv.includes("--emulator");
const projectId = emulator ? "demo-prayerapp" : arg("project");
const inSeconds = Number(arg("in") ?? 60);
const verseRef = arg("verse") ?? "PHP.4.6-7";
if (!projectId) { console.error("Pass --project <id> or --emulator"); process.exit(1); }
if (emulator) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore();
const id = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}t${randomBytes(3).toString("hex")}`;
const fireAt = new Date(Date.now() + inSeconds * 1000);
const ref = db.doc(`protoRuns/${id}`);
await ref.set({ fireAt: Timestamp.fromDate(fireAt), verseRef, createdAt: Timestamp.now() });
console.log(`run ${id}: fires at ${fireAt.toLocaleTimeString()} (in ${inSeconds}s)`);

const t = (ts) => ts?.toDate?.();
const deadline = Date.now() + (inSeconds + 180) * 1000;
let last = "";
while (Date.now() < deadline) {
  const d = (await ref.get()).data();
  const line = JSON.stringify([!!d.enqueuedAt, !!d.firedAt, !!d.sentAt]);
  if (line !== last) {
    last = line;
    if (d.enqueuedAt) console.log(`  enqueued   ${t(d.enqueuedAt).toLocaleTimeString()}`);
    if (d.firedAt) console.log(`  fired      ${t(d.firedAt).toLocaleTimeString()}  (${((t(d.firedAt) - fireAt) / 1000).toFixed(2)} s after the chosen moment)`);
    if (d.sentAt) {
      console.log(`  sent       ${t(d.sentAt).toLocaleTimeString()}  (FCM accepted it ${((t(d.sentAt) - t(d.firedAt)) / 1000).toFixed(2)} s after firing)`);
      console.log(`  messageId  ${d.messageId}  attempts ${d.attempts}`);
      console.log("\nNow note, on each device: when the alert appeared (lock screen / banner time), in which app state.");
      process.exit(0);
    }
  }
  await new Promise((r) => setTimeout(r, 500));
}
console.error("Timed out waiting for the run to send. Check: firebase functions:log --only protoFirePrompt");
process.exit(1);
