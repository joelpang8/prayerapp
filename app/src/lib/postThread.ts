import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { FEED_CHUNK_SIZE } from "./feed";
import type { FriendScope, FriendScopedCache } from "./friendScope";

/**
 * One post's comments or reactions, live, oldest first, while the post is on
 * screen.
 *
 * Only items the rules let me read are requested: mine, and those by my
 * current friends (each query names its authors, as the rules require).
 * Registered with FriendScope, so when a friendship ends:
 *  - that friend's items are dropped from memory at once;
 *  - if they wrote the post, the whole thread is dropped.
 * Memory only; nothing is written to disk.
 */
export class PostThread<T extends { authorId: string; createdAt: Date }> implements FriendScopedCache {
  private readonly byAuthor = new Map<string, T[]>();
  private readonly listeners = new Set<(items: T[]) => void>();
  private chunks: Unsubscribe[] = [];
  private visible = new Set<string>();
  private unsubscribeScope: (() => void) | null = null;
  private unregister: (() => void) | null = null;
  private snapshot: T[] = [];

  constructor(
    private readonly db: Firestore,
    private readonly scope: FriendScope,
    private readonly post: { id: string; authorId: string },
    private readonly subcollection: "comments" | "reactions",
    private readonly parse: (id: string, data: DocumentData) => T | null,
    private readonly options: { chunkSize?: number; onError?: (err: Error) => void } = {},
  ) {}

  get items(): T[] {
    return this.snapshot;
  }

  start(): void {
    if (this.unsubscribeScope) return;
    this.unregister = this.scope.register(this);
    this.unsubscribeScope = this.scope.subscribe((graph) => this.sync(graph.friends));
  }

  stop(): void {
    this.unsubscribeScope?.();
    this.unregister?.();
    this.unsubscribeScope = this.unregister = null;
    this.clear();
  }

  subscribe(listener: (items: T[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  evictAuthor(uid: string): void {
    if (uid === this.post.authorId) {
      // I can't see the post any more, so none of its thread either.
      this.visible = new Set();
      this.closeChunks();
      this.byAuthor.clear();
    } else {
      this.byAuthor.delete(uid);
      if (this.visible.delete(uid)) this.openChunks();
    }
    this.publish();
  }

  clear(): void {
    this.closeChunks();
    this.visible = new Set();
    this.byAuthor.clear();
    this.publish();
  }

  private sync(friends: ReadonlySet<string>): void {
    const me = this.scope.me;
    const canSeePost = this.post.authorId === me || friends.has(this.post.authorId);
    const next = canSeePost ? new Set([me, ...friends]) : new Set<string>();
    const same = next.size === this.visible.size && [...next].every((u) => this.visible.has(u));
    if (same && this.chunks.length > 0) return;
    for (const uid of this.byAuthor.keys()) if (!next.has(uid)) this.byAuthor.delete(uid);
    this.visible = next;
    this.openChunks();
    this.publish();
  }

  /** (Re)open one listener per chunk of visible authors. */
  private openChunks(): void {
    this.closeChunks();
    const authors = [...this.visible];
    const size = this.options.chunkSize ?? FEED_CHUNK_SIZE;
    for (let i = 0; i < authors.length; i += size) {
      const chunk = authors.slice(i, i + size);
      this.chunks.push(
        onSnapshot(
          query(collection(this.db, "posts", this.post.id, this.subcollection), where("authorId", "in", chunk)),
          (snap) => {
            const fresh = new Map<string, T[]>(chunk.filter((a) => this.visible.has(a)).map((a) => [a, []]));
            for (const d of snap.docs) {
              const item = this.parse(d.id, d.data({ serverTimestamps: "estimate" }));
              const list = item && fresh.get(item.authorId);
              if (!item || !list) continue; // evicted while this snapshot was in flight
              list.push(item);
            }
            for (const [author, list] of fresh) this.byAuthor.set(author, list);
            this.publish();
          },
          (err) => {
            // Typically permission-denied right after an unfriend; FriendScope's
            // update rebuilds the listeners without them.
            for (const a of chunk) this.byAuthor.delete(a);
            this.publish();
            this.options.onError?.(err);
          },
        ),
      );
    }
  }

  private closeChunks(): void {
    for (const stop of this.chunks) stop();
    this.chunks = [];
  }

  private publish(): void {
    this.snapshot = [...this.byAuthor.values()].flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const l of this.listeners) l(this.snapshot);
  }
}
