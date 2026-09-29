// Development only: sends today's prompt in the local emulators.
//
//   npm run dev:prompt                  # prompt fires now
//   npm run dev:prompt -- --minutes-ago 10   # fired 10 min ago (posts will be late)
//
// In production, prompts are sent by the step 4 scheduler (not built yet).
// This script refuses to run unless it's pointed at the Firestore emulator.
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

initializeApp({ projectId: "demo-prayerapp" });
await getFirestore().doc(`prompts/${id}`).set({ firedAt: Timestamp.fromDate(firedAt) });
console.log(`Prompt ${id} fired at ${firedAt.toLocaleTimeString()}`);
