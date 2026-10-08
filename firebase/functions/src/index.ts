import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
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
  const posts = await db.collection("posts").where("authorId", "==", post.authorId).select("verseRef").get();
  await db.doc(`users/${post.authorId}/private/verseIndex`).set(buildVerseIndex(posts.docs.map((d) => d.get("verseRef"))));
});
