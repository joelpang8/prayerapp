/**
 * STEP 4 PROTOTYPE, isolated from the app's real functions (own codebase:
 * deploy with `firebase deploy --only functions:notify-proto`, delete with
 * `firebase functions:delete ... --force` or by removing the codebase).
 *
 * Exercises the two risky mechanisms end to end:
 *   1. firing at a precise, pre-chosen moment (Cloud Tasks with scheduleTime)
 *   2. reaching every device at once (FCM topic push)
 *
 * Flow: an admin script writes protoRuns/{runId} {fireAt}. A trigger enqueues
 * a task for exactly fireAt. The task records the real firedAt (once, even if
 * Cloud Tasks retries) and sends the topic push. Timings are written back to
 * the run doc so delivery can be compared with what devices report.
 * protoRuns is closed to clients by firestore.rules.
 */
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { buildPromptMessage } from "./message";

initializeApp();

export const PROTO_TOPIC = "proto-prompt";

export const protoScheduleRun = onDocumentCreated("protoRuns/{runId}", async (event) => {
  const fireAt = event.data?.get("fireAt") as Timestamp | undefined;
  if (!fireAt) return;
  const queue = getFunctions().taskQueue<{ runId: string }>("protoFirePrompt");
  await queue.enqueue(
    { runId: event.params.runId },
    // A past fireAt fires immediately.
    { scheduleTime: fireAt.toDate(), id: `run-${event.params.runId}` },
  );
  await event.data!.ref.update({ enqueuedAt: FieldValue.serverTimestamp() });
});

export const protoFirePrompt = onTaskDispatched<{ runId: string }>(
  { retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 }, rateLimits: { maxConcurrentDispatches: 10 } },
  async (req) => {
    const ref = getFirestore().doc(`protoRuns/${req.data.runId}`);
    // Never fire before the chosen moment. Cloud Tasks aims for scheduleTime
    // but (at least in the emulator) can dispatch a few seconds early; wait
    // out a small early delivery, and push a big one back to the queue.
    const fireAt = (await ref.get()).get("fireAt") as Timestamp | undefined;
    const early = fireAt ? fireAt.toMillis() - Date.now() : 0;
    if (early > 60_000) throw new Error(`dispatched ${early}ms early; retrying later`);
    if (early > 0) await new Promise((r) => setTimeout(r, early));

    // Idempotent: Cloud Tasks delivers at least once. Only the first attempt
    // claims firedAt; a retry after a successful send doesn't send again.
    const claimed = await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("sentAt")) return null;
      const firedAt = (snap.get("firedAt") as Timestamp | undefined) ?? Timestamp.now();
      if (!snap.get("firedAt")) tx.update(ref, { firedAt, attempts: FieldValue.increment(1) });
      else tx.update(ref, { attempts: FieldValue.increment(1) });
      return { firedAt, verseRef: (snap.get("verseRef") as string | undefined) ?? null };
    });
    if (!claimed) return;
    const message = buildPromptMessage({ topic: PROTO_TOPIC, promptId: req.data.runId, firedAt: claimed.firedAt.toDate(), verseRef: claimed.verseRef });
    // The emulators have no FCM; record a dry run so scheduling and
    // idempotency can still be tested end to end locally.
    // If the send succeeds but this update fails, a retry sends again; the
    // collapse id/tag makes the device replace, not duplicate, the alert.
    const messageId = process.env.FUNCTIONS_EMULATOR === "true" ? "emulator-dry-run" : await getMessaging().send(message);
    await ref.update({ sentAt: FieldValue.serverTimestamp(), messageId });
    logger.info("prototype prompt sent", { runId: req.data.runId, messageId });
  },
);
