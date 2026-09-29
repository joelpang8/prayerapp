import { memoryEagerGarbageCollector, memoryLocalCache, type FirestoreSettings } from "firebase/firestore";

/**
 * Memory-only cache with eager garbage collection:
 *  - nothing from Firestore (in particular other people's posts) is ever
 *    written to disk on this device;
 *  - a document leaves the in-memory cache as soon as no active listener
 *    covers it, so tearing down a friend's feed listener also drops their
 *    posts from the SDK cache.
 * Tested in tests/firestoreCache.test.ts.
 */
export const firestoreSettings: FirestoreSettings = {
  localCache: memoryLocalCache({ garbageCollector: memoryEagerGarbageCollector() }),
};
