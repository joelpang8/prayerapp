import { getBytes, ref, type FirebaseStorage } from "firebase/storage";
import { bytesToBase64 } from "./base64";
import type { FriendScopedCache } from "./friendScope";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** postPhotos/{authorId}/{photoId}.jpg -> authorId */
export function authorOfPhotoPath(path: string): string {
  const m = /^postPhotos\/([A-Za-z0-9]+)\/[A-Za-z0-9]+\.jpg$/.exec(path);
  if (!m) throw new Error(`Not a post photo path: ${path}`);
  return m[1];
}

/** avatars/{uid}/{avatarId}.jpg -> uid */
export function ownerOfAvatarPath(path: string): string {
  const m = /^avatars\/([A-Za-z0-9]+)\/[A-Za-z0-9]+\.jpg$/.exec(path);
  if (!m) throw new Error(`Not a profile photo path: ${path}`);
  return m[1];
}

export class PhotoEvictedError extends Error {
  constructor(path: string) {
    super(`Photo evicted while loading: ${path}`);
    this.name = "PhotoEvictedError";
  }
}

export type PhotoLoader = (path: string) => Promise<ArrayBuffer>;

/**
 * Loads through the Storage SDK, so storage.rules (the live mutual-friend
 * check) runs on every fetch. Never replace this with getDownloadURL(): a
 * download URL skips the rules and never expires.
 */
export function storageLoader(storage: FirebaseStorage): PhotoLoader {
  return (path) => getBytes(ref(storage, path), MAX_PHOTO_BYTES);
}

/**
 * Memory-only cache of decoded post photos, as data URIs ready for <Image>.
 * Nothing is written to disk. Registered with FriendScope, so a removed
 * friend's photos are dropped the moment the friendship ends.
 */
export class PhotoCache implements FriendScopedCache {
  private readonly entries = new Map<string, { author: string; uri: string }>();
  private readonly inflight = new Map<string, Promise<string>>();
  // Bumped on evict/clear so a fetch that was in flight can't repopulate.
  private generation = new Map<string, number>();
  private clearCount = 0;

  constructor(
    private readonly load: PhotoLoader,
    private readonly maxEntries = 60,
    // Which user a path belongs to; profile photos use ownerOfAvatarPath.
    private readonly authorOf: (path: string) => string = authorOfPhotoPath,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  peek(path: string): string | undefined {
    return this.entries.get(path)?.uri;
  }

  async get(path: string): Promise<string> {
    const hit = this.entries.get(path);
    if (hit) {
      // Refresh LRU position.
      this.entries.delete(path);
      this.entries.set(path, hit);
      return hit.uri;
    }
    const pending = this.inflight.get(path);
    if (pending) return pending;

    const author = this.authorOf(path);
    const gen = this.generation.get(author) ?? 0;
    const clears = this.clearCount;
    const promise = this.load(path)
      .then((bytes) => {
        const uri = `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
        const stillValid = (this.generation.get(author) ?? 0) === gen && this.clearCount === clears;
        // Evicted while downloading: don't cache it and don't hand it out.
        if (!stillValid) throw new PhotoEvictedError(path);
        this.entries.set(path, { author, uri });
        while (this.entries.size > this.maxEntries) {
          this.entries.delete(this.entries.keys().next().value!);
        }
        return uri;
      })
      .finally(() => this.inflight.delete(path));
    this.inflight.set(path, promise);
    return promise;
  }

  evictAuthor(uid: string): void {
    this.generation.set(uid, (this.generation.get(uid) ?? 0) + 1);
    for (const [path, entry] of this.entries) if (entry.author === uid) this.entries.delete(path);
  }

  clear(): void {
    this.clearCount++;
    this.entries.clear();
  }
}
