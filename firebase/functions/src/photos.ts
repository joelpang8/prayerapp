// Must match storage.rules: postPhotos/{authorId}/{photoId}.jpg
const POST_PHOTO = /^postPhotos\/([A-Za-z0-9]+)\/[A-Za-z0-9]{1,64}\.jpg$/;
const UID = /^[A-Za-z0-9]{1,128}$/;

/** The author uid if `path` is a post photo, else null. */
export function postPhotoAuthor(path: string | undefined | null): string | null {
  if (!path) return null;
  const m = POST_PHOTO.exec(path);
  return m ? m[1] : null;
}

/**
 * A post's photo may only be cleaned up if it really is that author's photo.
 * The rules already enforce this on write; this is defense in depth so the
 * function can never be steered into deleting someone else's file.
 */
export function ownedPhotoPath(post: { authorId?: unknown; photoPath?: unknown } | undefined): string | null {
  if (!post || typeof post.photoPath !== "string" || typeof post.authorId !== "string") return null;
  return postPhotoAuthor(post.photoPath) === post.authorId ? post.photoPath : null;
}

// The subset of @google-cloud/storage used here, so the logic is testable.
export interface FileLike {
  name: string;
  metadata?: { metadata?: Record<string, unknown> | null };
  setMetadata(update: { metadata: Record<string, null> }): Promise<unknown>;
}
export interface BucketLike {
  getFiles(query: { prefix: string }): Promise<[FileLike[], ...unknown[]]>;
}

const TOKEN_KEY = "firebaseStorageDownloadTokens";

export function hasDownloadToken(file: Pick<FileLike, "metadata">): boolean {
  return Boolean(file.metadata?.metadata?.[TOKEN_KEY]);
}

/**
 * Removes the download token from a photo. A download URL embeds this token
 * and works for anyone, forever, without going through storage.rules.
 * Setting the custom-metadata key to null deletes it (GCS PATCH semantics).
 */
export async function revokeFileToken(file: FileLike): Promise<boolean> {
  if (!postPhotoAuthor(file.name) || !hasDownloadToken(file)) return false;
  await file.setMetadata({ metadata: { [TOKEN_KEY]: null } });
  return true;
}

/** Revoke the download tokens of every post photo belonging to `uid`. */
export async function revokeUserPhotoTokens(bucket: BucketLike, uid: string): Promise<number> {
  if (!UID.test(uid)) return 0;
  const [files] = await bucket.getFiles({ prefix: `postPhotos/${uid}/` });
  let revoked = 0;
  for (const file of files) if (await revokeFileToken(file)) revoked++;
  return revoked;
}
