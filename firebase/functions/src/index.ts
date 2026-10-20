import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { deleteAccountData, isRecentSignIn } from "./accountDeletion";
import { buildPromptMessage, dateKeyIn, pickFireTime, PROMPT_WINDOW, verseForDate, windowEnd } from "./dailyPrompt";
import { buildVerseIndex, staleTaps } from "./prayers";
import { ownedAvatarPath, ownedPhotoPath, revokeFileToken, revokeUserPhotoTokens, type FileLike } from "./photos";

initializeApp();

/*
 * Download tokens and why there are two functions for them
 * --------------------------------------------------------
 * Firebase Storage gives files a download token, and a URL containing it
 * works forever for anyone, skipping storage.rules. The app never uses such
 * URLs (it reads bytes through the rules), but a modified client belonging
 * to a CURRENT friend could obtain one. Storage also mints a new token when
 * a reader who passes the rules requests a file that has none, so tokens
 * can't be prevented, only revoked:
 *
 *  1. stripPhotoDownloadTokens: drop the token right after upload, so photos
 *     normally have none.
 *  2. revokePhotoLinksOnUnfriend: when a friendship ends, revoke every token
 *     on BOTH people's photos. Any link the removed friend saved stops
 *     working, which is the guarantee that matters.
 */

export const stripPhotoDownloadTokens = onObjectFinalized(async (event) => {
  const { name, bucket } = event.data;
  const file = getStorage().bucket(bucket).file(name);
  if (await revokeFileToken({ name, metadata: { metadata: event.data.metadata ?? null }, setMetadata: (m) => file.setMetadata(m) })) {
    logger.info("Removed download token after upload", { name });
  }
});

export const revokePhotoLinksOnUnfriend = onDocumentDeleted("follows/{followId}", async (event) => {
  const edge = event.data?.data();
  if (!edge) return;
  const bucket = getStorage().bucket();
  const asBucketLike = {
    getFiles: async (q: { prefix: string }) => {
      const [files] = await bucket.getFiles(q);
      return [files as unknown as FileLike[]] as [FileLike[]];
    },
  };
  for (const uid of [edge.followerId, edge.followeeId]) {
    if (typeof uid !== "string") continue;
    const revoked = await revokeUserPhotoTokens(asBucketLike, uid);
    if (revoked) logger.info("Revoked photo links after a follow edge was removed", { uid, revoked });
  }
});

async function deletePhoto(path: string) {
  // ignoreNotFound: already gone (a retried event, or the post never had its
  // photo uploaded) is fine. Relying on the library option rather than
  // matching error codes, whose shape differs between GCS and the emulator.
  await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
}

/** Deleting a post deletes its photo. */
export const deletePhotoOfDeletedPost = onDocumentDeleted("posts/{postId}", async (event) => {
  const path = ownedPhotoPath(event.data?.data());
  if (path) await deletePhoto(path);
});

/**
 * Deleting a post deletes its comments and reactions. They're already
 * unreadable (the rules need the post to exist), but nobody's words or
 * reactions should be left behind. (Named before reactions existed.)
 */
export const deleteCommentsOfDeletedPost = onDocumentDeleted("posts/{postId}", async (event) => {
  const db = getFirestore();
  for (const sub of ["comments", "reactions"]) {
    await db.recursiveDelete(db.collection(`posts/${event.params.postId}/${sub}`));
  }
});

/** Replacing a post's photo (an edit) deletes the old one. */
export const deleteReplacedPhoto = onDocumentUpdated("posts/{postId}", async (event) => {
  const oldPath = ownedPhotoPath(event.data?.before.data());
  if (oldPath && oldPath !== event.data?.after.data()?.photoPath) await deletePhoto(oldPath);
});

/** Changing or removing a profile photo deletes the old file. */
export const deleteReplacedAvatar = onDocumentUpdated("users/{uid}", async (event) => {
  const oldPath = ownedAvatarPath(event.params.uid, event.data?.before.data());
  if (oldPath && oldPath !== event.data?.after.data()?.avatarPath) await deletePhoto(oldPath);
});

/*
 * "I'll pray for this" taps live at users/{owner}/prayingFor/{itemId}_{friend}.
 * The rules only let current friends tap, and the owner's app only counts
 * current friends on current requests; these two functions also delete the
 * taps that no longer count, so none are left behind.
 */

/** A friendship ending (unfriend, decline or block) deletes taps both ways. */
export const removePrayingOnUnfriend = onDocumentDeleted("follows/{followId}", async (event) => {
  const edge = event.data?.data();
  if (!edge || typeof edge.followerId !== "string" || typeof edge.followeeId !== "string") return;
  const db = getFirestore();
  for (const [owner, friend] of [[edge.followerId, edge.followeeId], [edge.followeeId, edge.followerId]]) {
    const snap = await db.collection(`users/${owner}/prayingFor`).where("friendUid", "==", friend).get();
    if (snap.empty) continue;
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    logger.info("Removed prayer taps after a friendship ended", { owner, removed: snap.size });
  }
});

/** A request removed or reworded (it gets a new id) deletes its taps. */
export const removePrayingForChangedRequests = onDocumentWritten("users/{uid}/friendsOnly/about", async (event) => {
  const db = getFirestore();
  const taps = await db.collection(`users/${event.params.uid}/prayingFor`).get();
  if (taps.empty) return;
  const stale = staleTaps(taps.docs.map((d) => ({ id: d.id, itemId: d.get("itemId") })), event.data?.after.data()?.requestIds);
  if (!stale.length) return;
  const batch = db.batch();
  for (const id of stale) batch.delete(db.doc(`users/${event.params.uid}/prayingFor/${id}`));
  await batch.commit();
});

/**
 * users/{uid}/private/verseIndex: the books and verses of my own posts, for
 * the Prayers tab's verse filter, so the app never has to read years of
 * posts to fill the picker. Rebuilt from the author's posts whenever one is
 * added or deleted, so it corrects itself if an event is ever missed.
 * Owner-only (firestore.rules), written only here.
 */
export const updateVerseIndex = onDocumentWritten("posts/{postId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Only a new or deleted post with a verse changes the index (the verse
  // can't be edited).
  if (before && after) return;
  const post = after ?? before;
  if (!post?.verseRef || typeof post.authorId !== "string") return;
  const db = getFirestore();
  const indexRef = db.doc(`users/${post.authorId}/private/verseIndex`);
  // An account being deleted: don't recreate its index.
  if (!(await db.doc(`users/${post.authorId}`).get()).exists) {
    await indexRef.delete();
    return;
  }
  const posts = await db.collection("posts").where("authorId", "==", post.authorId).select("verseRef").get();
  await indexRef.set(buildVerseIndex(posts.docs.map((d) => d.get("verseRef"))));
});

/*
 * The daily prompt (step 4, proven on an iPhone with the prototype first).
 *
 *   planDailyPrompt (07:00 New York) ──creates──▶ promptSchedule/{date} {fireAt, verseRef}
 *                                                   (server-only: clients are denied by the rules,
 *                                                    so nobody can see the moment in advance)
 *   schedulePromptTask (on create) ──▶ Cloud Task for exactly fireAt
 *   firePrompt (at fireAt) ──creates──▶ prompts/{date} {firedAt, verseRef}
 *                          ──sends────▶ one FCM topic push "Time to pray"
 *
 * Idempotent at each step: the schedule doc and the prompt are created only
 * once; Cloud Tasks may deliver twice, but only the first attempt claims
 * firedAt, and once sent a retry does nothing. A prompt already sent by hand
 * that day (npm run prompt:real) is left alone and no push is sent.
 */

/** Plans the day's prompt; safe to call more than once a day. Exported for tests. */
export async function planPrompt(dateKey: string, now = new Date()): Promise<"planned" | "exists" | "too-late"> {
  if (now.getTime() >= windowEnd(dateKey).getTime()) return "too-late";
  const ref = getFirestore().doc(`promptSchedule/${dateKey}`);
  // If the planner runs late (after a retry), never pick a moment already past.
  let fireAt = pickFireTime(dateKey);
  if (fireAt.getTime() < now.getTime()) fireAt = new Date(now.getTime() + 60_000);
  try {
    await ref.create({ fireAt: Timestamp.fromDate(fireAt), verseRef: verseForDate(dateKey), createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) return "exists";
    throw err;
  }
  return "planned";
}

export const planDailyPrompt = onSchedule(
  { schedule: "0 7 * * *", timeZone: PROMPT_WINDOW.timeZone, retryCount: 3 },
  async () => {
    const dateKey = dateKeyIn(new Date(), PROMPT_WINDOW.timeZone);
    const result = await planPrompt(dateKey);
    // Deliberately doesn't log the moment: it stays secret until it fires.
    logger.info("daily prompt planned", { dateKey, result });
  },
);

export const schedulePromptTask = onDocumentCreated("promptSchedule/{dateKey}", async (event) => {
  const fireAt = event.data?.get("fireAt") as Timestamp | undefined;
  if (!fireAt) return;
  const queue = getFunctions().taskQueue<{ dateKey: string }>("firePrompt");
  try {
    // A past fireAt fires immediately. The task id makes a second enqueue a no-op.
    await queue.enqueue({ dateKey: event.params.dateKey }, { scheduleTime: fireAt.toDate(), id: `prompt-${event.params.dateKey}` });
  } catch (err) {
    if (!/already exists/i.test(String((err as Error).message))) throw err;
  }
  await event.data!.ref.update({ enqueuedAt: FieldValue.serverTimestamp() });
});

export const firePrompt = onTaskDispatched<{ dateKey: string }>(
  { retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 }, rateLimits: { maxConcurrentDispatches: 10 } },
  async (req) => {
    const db = getFirestore();
    const scheduleRef = db.doc(`promptSchedule/${req.data.dateKey}`);
    const promptRef = db.doc(`prompts/${req.data.dateKey}`);
    // Never fire before the chosen moment: wait out a small early delivery,
    // push a big one back to the queue.
    const fireAt = (await scheduleRef.get()).get("fireAt") as Timestamp | undefined;
    const early = fireAt ? fireAt.toMillis() - Date.now() : 0;
    if (early > 60_000) throw new Error(`dispatched ${early}ms early; retrying later`);
    if (early > 0) await new Promise((r) => setTimeout(r, early));

    const claimed = await db.runTransaction(async (tx) => {
      const schedule = await tx.get(scheduleRef);
      if (!schedule.exists || schedule.get("sentAt") || schedule.get("skipped")) return null;
      let firedAt = schedule.get("firedAt") as Timestamp | undefined;
      const verseRef = (schedule.get("verseRef") as string | null | undefined) ?? null;
      if (!firedAt) {
        if ((await tx.get(promptRef)).exists) {
          tx.update(scheduleRef, { skipped: "a prompt was already sent today" });
          return null;
        }
        firedAt = Timestamp.now();
        tx.create(promptRef, { firedAt, ...(verseRef ? { verseRef } : {}) });
        tx.update(scheduleRef, { firedAt, attempts: FieldValue.increment(1) });
      } else {
        tx.update(scheduleRef, { attempts: FieldValue.increment(1) });
      }
      return { firedAt, verseRef };
    });
    if (!claimed) return;
    const message = buildPromptMessage({ promptId: req.data.dateKey, firedAt: claimed.firedAt.toDate(), verseRef: claimed.verseRef });
    // The emulators have no FCM: record a dry run so the rest can be tested.
    // If the send succeeds but this update fails, a retry sends again; the
    // collapse id makes the phone replace the alert, not show two.
    const messageId = process.env.FUNCTIONS_EMULATOR === "true" ? "emulator-dry-run" : await getMessaging().send(message);
    await scheduleRef.update({ sentAt: FieldValue.serverTimestamp(), messageId });
    logger.info("daily prompt sent", { dateKey: req.data.dateKey, messageId });
  },
);

/**
 * "Delete my account" (Settings). Only for the signed-in person themselves,
 * and only right after signing in again, so a phone left unlocked can't be
 * used to delete someone's account. See accountDeletion.ts for what goes.
 */
export const deleteAccount = onCall({ timeoutSeconds: 300 }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!isRecentSignIn(req.auth?.token.auth_time)) {
    throw new HttpsError("failed-precondition", "Please sign in again, then delete within 5 minutes.");
  }
  const bucket = getStorage().bucket();
  const summary = await deleteAccountData(uid, {
    db: getFirestore(),
    deleteFiles: (prefix) => bucket.deleteFiles({ prefix }),
    deleteAuthUser: (id) => getAuth().deleteUser(id).catch((err) => {
      if (err?.code !== "auth/user-not-found") throw err;
    }),
  });
  // Counts only: nothing about what was deleted.
  logger.info("account deleted", { summary });
  return { deleted: true };
});
