import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { CommentThread, type Comment } from "./comments";
import type { FeedStore } from "./feed";
import type { FriendScope, FriendScopedCache } from "./friendScope";
import { watchMyPostsBetween, type Post } from "./posts";
import { ReactionThread, type Reaction, type ReactionKind } from "./reactions";

/** How far back the Activity list goes. */
export const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 100;

export type Activity = {
  id: string;
  kind: "posted" | "answered" | "commented" | "reacted";
  /** Who did it: always a current friend, never me. */
  actorId: string;
  postId: string;
  at: Date;
  /** commented: the comment; answered: the answer note, if any. */
  text?: string;
  reaction?: ReactionKind;
};

/**
 * The Activity list, newest first, from what's already on the phone:
 *  - friends' posts (the feed): "posted", and "answered" when they mark one;
 *  - comments and reactions by friends on my own recent posts.
 * Only current friends, only the last 7 days, never my own actions.
 */
export function buildActivity(input: {
  me: string;
  isFriend: (uid: string) => boolean;
  now: Date;
  feed: readonly Post[];
  onMyPosts: readonly { postId: string; comments: readonly Comment[]; reactions: readonly Reaction[] }[];
}): Activity[] {
  const since = input.now.getTime() - ACTIVITY_WINDOW_MS;
  const recent = (d: Date | null): d is Date => !!d && d.getTime() >= since;
  const items: Activity[] = [];
  for (const p of input.feed) {
    if (recent(p.createdAt)) items.push({ id: `posted:${p.id}`, kind: "posted", actorId: p.authorId, postId: p.id, at: p.createdAt });
    if (recent(p.answeredAt)) {
      items.push({ id: `answered:${p.id}`, kind: "answered", actorId: p.authorId, postId: p.id, at: p.answeredAt, text: p.answerNote ?? undefined });
    }
  }
  for (const mine of input.onMyPosts) {
    for (const c of mine.comments) {
      if (recent(c.createdAt)) items.push({ id: `commented:${mine.postId}:${c.id}`, kind: "commented", actorId: c.authorId, postId: mine.postId, at: c.createdAt, text: c.text });
    }
    for (const r of mine.reactions) {
      if (recent(r.createdAt)) items.push({ id: `reacted:${mine.postId}:${r.authorId}`, kind: "reacted", actorId: r.authorId, postId: mine.postId, at: r.createdAt, reaction: r.kind });
    }
  }
  return items
    .filter((a) => a.actorId !== input.me && input.isFriend(a.actorId))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, MAX_ITEMS);
}

/** "now", "5m", "3h", "2d". */
export function timeAgo(at: Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - at.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

type Threads = { comments: CommentThread; reactions: ReactionThread; items: { comments: Comment[]; reactions: Reaction[] }; stop: () => void };

/**
 * Keeps the Activity list live for the signed-in session. Registered with
 * FriendScope like everything holding other people's content: the comment
 * and reaction threads it opens register themselves too, and the list is
 * filtered to current friends on every change. Memory only.
 */
export class ActivityStore implements FriendScopedCache {
  private feedPosts: readonly Post[] = [];
  private readonly threads = new Map<string, Threads>();
  private readonly listeners = new Set<(items: Activity[]) => void>();
  private snapshot: Activity[] = [];
  private stops: (() => void)[] = [];
  private unsubscribeMine: Unsubscribe | null = null;

  constructor(
    private readonly db: Firestore,
    private readonly scope: FriendScope,
    private readonly feed: FeedStore,
    private readonly onError: (err: Error) => void = () => {},
  ) {}

  get items(): Activity[] {
    return this.snapshot;
  }

  start(): void {
    if (this.stops.length) return;
    this.stops.push(this.scope.register(this));
    this.stops.push(this.feed.subscribe((posts) => { this.feedPosts = posts; this.publish(); }));
    // My posts from the last week, to follow their comments and reactions.
    const from = new Date(Date.now() - ACTIVITY_WINDOW_MS);
    // No real upper bound: the year 3000 is within Firestore's timestamp range.
    this.unsubscribeMine = watchMyPostsBetween(this.db, this.scope.me, from, new Date("3000-01-01T00:00:00Z"), (posts) => this.syncThreads(posts), this.onError);
  }

  stop(): void {
    this.unsubscribeMine?.();
    this.unsubscribeMine = null;
    for (const stop of this.stops) stop();
    this.stops = [];
    this.clear();
  }

  subscribe(listener: (items: Activity[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  /** FriendScope has already updated the friend set; recomputing drops them. */
  evictAuthor(): void {
    this.publish();
  }

  clear(): void {
    for (const t of this.threads.values()) t.stop();
    this.threads.clear();
    this.feedPosts = [];
    this.publish();
  }

  private syncThreads(posts: Post[]): void {
    const ids = new Set(posts.map((p) => p.id));
    for (const [id, t] of this.threads) {
      if (!ids.has(id)) {
        t.stop();
        this.threads.delete(id);
      }
    }
    for (const post of posts) {
      if (this.threads.has(post.id)) continue;
      const ref = { id: post.id, authorId: post.authorId };
      const comments = new CommentThread(this.db, this.scope, ref, { onError: this.onError });
      const reactions = new ReactionThread(this.db, this.scope, ref, { onError: this.onError });
      const entry: Threads = {
        comments,
        reactions,
        items: { comments: [], reactions: [] },
        stop: () => {
          unsubC();
          unsubR();
          comments.stop();
          reactions.stop();
        },
      };
      const unsubC = comments.subscribe((c) => { entry.items.comments = c; this.publish(); });
      const unsubR = reactions.subscribe((r) => { entry.items.reactions = r; this.publish(); });
      comments.start();
      reactions.start();
      this.threads.set(post.id, entry);
    }
    this.publish();
  }

  private publish(): void {
    this.snapshot = buildActivity({
      me: this.scope.me,
      isFriend: (uid) => this.scope.isFriend(uid),
      now: new Date(),
      feed: this.feedPosts,
      onMyPosts: [...this.threads.entries()].map(([postId, t]) => ({ postId, ...t.items })),
    });
    for (const l of this.listeners) l(this.snapshot);
  }
}

// When I last opened Activity, per account, to count what's new. Only a
// timestamp: nothing about anyone's activity is written to the device.
const seenKey = (uid: string) => `activity.lastSeen.${uid}`;

export async function loadLastSeen(uid: string): Promise<number> {
  try {
    return Number(await AsyncStorage.getItem(seenKey(uid))) || 0;
  } catch {
    return 0;
  }
}

export function saveLastSeen(uid: string, at: number): void {
  AsyncStorage.setItem(seenKey(uid), String(at)).catch(() => {});
}
