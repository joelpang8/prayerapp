// Must match storage.rules: postPhotos/{authorId}/{photoId}.jpg
const POST_PHOTO = /^postPhotos\/([A-Za-z0-9]+)\/[A-Za-z0-9]{1,64}\.jpg$/;
// Must match storage.rules: avatars/{uid}/{avatarId}.jpg
const AVATAR = /^avatars\/([A-Za-z0-9]+)\/[A-Za-z0-9]{1,64}\.jpg$/;
const UID = /^[A-Za-z0-9]{1,128}$/;

/** The author uid if `path` is a post photo, else null. */
export function postPhotoAuthor(path: string | undefined | null): string | null {
  if (!path) return null;
  const m = POST_PHOTO.exec(path);
  return m ? m[1] : null;
}

/** The owner uid if `path` is a profile photo, else null. */
export function avatarOwner(path: string | undefined | null): string | null {
  if (!path) return null;
  const m = AVATAR.exec(path);
  return m ? m[1] : null;
}

/** A profile's photo path, only if it's in that user's own avatars folder. */
export function ownedAvatarPath(uid: string, profile: { avatarPath?: unknown } | undefined): string | null {
  const p = profile?.avatarPath;
  return typeof p === "string" && avatarOwner(p) === uid ? p : null;
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
/** GCS reports a missing object as code 404; match the message too, for the emulator. */
export function isNotFound(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === 404 || e?.code === "404" || /no such object|not found/i.test(String(e?.message ?? ""));
}

export async function revokeFileToken(file: FileLike): Promise<boolean> {
  // Post photos and profile photos: neither should have a permanent link.
  if ((!postPhotoAuthor(file.name) && !avatarOwner(file.name)) || !hasDownloadToken(file)) return false;
  try {
    await file.setMetadata({ metadata: { [TOKEN_KEY]: null } });
  } catch (err) {
    // Deleted in the meantime (e.g. a post that failed right after upload,
    // or deleted by its author): nothing left to revoke.
    if (isNotFound(err)) return false;
    throw err;
  }
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
