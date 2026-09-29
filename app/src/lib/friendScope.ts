import type { Firestore, Unsubscribe } from "firebase/firestore";
import { EMPTY_GRAPH, watchFriendGraph, type FriendGraph } from "./friends";

/**
 * Anything on this device that holds content belonging to other users
 * (feed listeners, decoded photos, ...) registers here. When a friendship
 * ends, that friend's content is dropped immediately: this does not wait
 * for the server to reject a later read.
 */
export interface FriendScopedCache {
  /** Drop everything authored by `uid` and stop listening for more. */
  evictAuthor(uid: string): void;
  /** Drop everything (sign-out). */
  clear(): void;
}

type GraphListener = (graph: FriendGraph) => void;

/**
 * The one place the app learns who its friends are. It watches the live
 * follow graph and, whenever someone leaves the friend set, evicts them from
 * every registered cache before notifying the UI.
 */
export class FriendScope {
  private graph: FriendGraph = EMPTY_GRAPH;
  private loaded = false;
  private readonly caches = new Set<FriendScopedCache>();
  private readonly listeners = new Set<GraphListener>();
  private unsubscribe: Unsubscribe | null = null;

  constructor(
    private readonly db: Firestore,
    readonly me: string,
  ) {}

  start(onError?: (err: Error) => void): void {
    if (this.unsubscribe) return;
    this.unsubscribe = watchFriendGraph(this.db, this.me, (g) => this.apply(g), onError);
  }

  /** Stop watching and clear every cache. Called on sign-out. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const cache of this.caches) cache.clear();
    this.graph = EMPTY_GRAPH;
    this.loaded = false;
    for (const l of this.listeners) l(this.graph);
  }

  get current(): FriendGraph {
    return this.graph;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  isFriend(uid: string): boolean {
    return this.graph.friends.has(uid);
  }

  register(cache: FriendScopedCache): () => void {
    this.caches.add(cache);
    return () => this.caches.delete(cache);
  }

  subscribe(listener: GraphListener): () => void {
    this.listeners.add(listener);
    if (this.loaded) listener(this.graph);
    return () => this.listeners.delete(listener);
  }

  /** Exposed for tests; normally driven by the server listener. */
  apply(next: FriendGraph): void {
    const removed = [...this.graph.friends].filter((uid) => !next.friends.has(uid));
    this.graph = next;
    this.loaded = true;
    // Evict first so no UI re-render can show stale content.
    for (const uid of removed) for (const cache of this.caches) cache.evictAuthor(uid);
    for (const l of this.listeners) l(next);
  }
}
