import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { ownedPhotoPath, revokeFileToken, revokeUserPhotoTokens, type FileLike } from "./photos";

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
  try {
    await getStorage().bucket().file(path).delete();
  } catch (err) {
    // Already gone (e.g. a retried event) is fine.
    if ((err as { code?: number }).code !== 404) throw err;
  }
}

/** Deleting a post deletes its photo. */
export const deletePhotoOfDeletedPost = onDocumentDeleted("posts/{postId}", async (event) => {
  const path = ownedPhotoPath(event.data?.data());
  if (path) await deletePhoto(path);
});

/** Replacing a post's photo (an edit) deletes the old one. */
export const deleteReplacedPhoto = onDocumentUpdated("posts/{postId}", async (event) => {
  const oldPath = ownedPhotoPath(event.data?.before.data());
  if (oldPath && oldPath !== event.data?.after.data()?.photoPath) await deletePhoto(oldPath);
});
