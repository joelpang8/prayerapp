import { collection, limit, onSnapshot, orderBy, query, where, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { FriendScope, FriendScopedCache } from "./friendScope";
import { postFromSnapshot, type Post } from "./posts";

/**
 * Friends per feed query. Each friend in an `in` query costs the rules two
 * exists() lookups (one per follow direction), and production caps lookups
 * per query evaluation. 5 friends = 10 lookups. To be confirmed against the
 * real project (see docs/step2-posts-feed.md).
 */
export const FEED_CHUNK_SIZE = 5;

type Chunk = { authors: Set<string>; unsubscribe: Unsubscribe | null };

/**
 * Friends' posts, newest first, live. Registered with FriendScope:
 *  - evictAuthor(uid): that friend's posts are dropped and the listener
 *    covering them is torn down immediately (which also drops them from
 *    the Firestore memory cache), before any UI re-render;
 *  - clear(): sign-out, everything goes.
 * Friends are grouped into chunks with stable membership, so adding or
 * removing one friend only re-subscribes one chunk.
 */
export class FeedStore implements FriendScopedCache {
  private readonly chunks: Chunk[] = [];
  private readonly postsByAuthor = new Map<string, Post[]>();
  private readonly listeners = new Set<(posts: Post[]) => void>();
  private unsubscribeScope: (() => void) | null = null;
  private unregister: (() => void) | null = null;
  private snapshot: Post[] = [];

  constructor(
    private readonly db: Firestore,
    private readonly scope: FriendScope,
    private readonly options: { chunkSize?: number; perChunkLimit?: number; onError?: (err: Error) => void } = {},
  ) {}

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

  get posts(): Post[] {
    return this.snapshot;
  }

  subscribe(listener: (posts: Post[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  evictAuthor(uid: string): void {
    // Copy: resubscribe() removes chunks that become empty.
    for (const chunk of [...this.chunks]) {
      if (chunk.authors.delete(uid)) this.resubscribe(chunk);
    }
    this.postsByAuthor.delete(uid);
    this.publish();
  }

  clear(): void {
    for (const chunk of this.chunks) chunk.unsubscribe?.();
    this.chunks.length = 0;
    this.postsByAuthor.clear();
    this.publish();
  }

  /** Align chunks with the current friend set. */
  private sync(friends: ReadonlySet<string>): void {
    const size = this.options.chunkSize ?? FEED_CHUNK_SIZE;
    const dirty = new Set<Chunk>();
    const present = new Set<string>();
    for (const chunk of this.chunks) {
      for (const uid of [...chunk.authors]) {
        if (friends.has(uid)) present.add(uid);
        else {
          chunk.authors.delete(uid);
          this.postsByAuthor.delete(uid);
          dirty.add(chunk);
        }
      }
    }
    for (const uid of friends) {
      if (present.has(uid)) continue;
      let chunk = this.chunks.find((c) => c.authors.size < size);
      if (!chunk) {
        chunk = { authors: new Set(), unsubscribe: null };
        this.chunks.push(chunk);
      }
      chunk.authors.add(uid);
      dirty.add(chunk);
    }
    for (const chunk of dirty) this.resubscribe(chunk);
    this.publish();
  }

  private resubscribe(chunk: Chunk): void {
    chunk.unsubscribe?.();
    chunk.unsubscribe = null;
    if (chunk.authors.size === 0) {
      this.chunks.splice(this.chunks.indexOf(chunk), 1);
      return;
    }
    const authors = [...chunk.authors];
    chunk.unsubscribe = onSnapshot(
      query(
        collection(this.db, "posts"),
        where("authorId", "in", authors),
        orderBy("createdAt", "desc"),
        limit(this.options.perChunkLimit ?? 30),
      ),
      (snap) => {
        // Only authors still in this chunk; a stale snapshot must not bring
        // back someone who was just evicted.
        const byAuthor = new Map<string, Post[]>(authors.filter((a) => chunk.authors.has(a)).map((a) => [a, []]));
        for (const d of snap.docs) {
          const post = postFromSnapshot(d);
          if (post && byAuthor.has(post.authorId)) byAuthor.get(post.authorId)!.push(post);
        }
        for (const [author, posts] of byAuthor) this.postsByAuthor.set(author, posts);
        this.publish();
      },
      (err) => {
        // Typically permission-denied right after a friendship ended; the
        // next sync from FriendScope rebuilds the chunk without them.
        for (const a of authors) this.postsByAuthor.delete(a);
        chunk.unsubscribe = null;
        this.publish();
        this.options.onError?.(err);
      },
    );
  }

  private publish(): void {
    this.snapshot = [...this.postsByAuthor.values()]
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const l of this.listeners) l(this.snapshot);
  }
}
