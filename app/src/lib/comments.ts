import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { FEED_CHUNK_SIZE } from "./feed";
import type { FriendScope, FriendScopedCache } from "./friendScope";

export const MAX_COMMENT = 500; // must match firestore.rules

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: Date;
};

export function commentProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Write something first.";
  if (trimmed.length > MAX_COMMENT) return `At most ${MAX_COMMENT} characters.`;
  return null;
}

const commentsOf = (db: Firestore, postId: string) => collection(db, "posts", postId, "comments");

export async function addComment(db: Firestore, postId: string, uid: string, text: string): Promise<void> {
  const problem = commentProblem(text);
  if (problem) throw new Error(problem);
  await addDoc(commentsOf(db, postId), { authorId: uid, text: text.trim(), createdAt: serverTimestamp() });
}

/** Allowed for the comment's author and the post's author (enforced by the rules). */
export function deleteComment(db: Firestore, postId: string, commentId: string): Promise<void> {
  return deleteDoc(doc(commentsOf(db, postId), commentId));
}

/** Whether `me` may delete `comment` on a post by `postAuthorId`. */
export const canDeleteComment = (me: string, postAuthorId: string, comment: Pick<Comment, "authorId">) =>
  comment.authorId === me || postAuthorId === me;

/**
 * One post's comments, live, oldest first, while a post is open on screen.
 *
 * Only comments the rules let me read are requested: mine, and those by my
 * current friends (each query names its authors, as the rules require).
 * Registered with FriendScope, so when a friendship ends:
 *  - that friend's comments are dropped from memory at once;
 *  - if they wrote the post, the whole thread is dropped.
 * Memory only; nothing is written to disk.
 */
export class CommentThread implements FriendScopedCache {
  private readonly byAuthor = new Map<string, Comment[]>();
  private readonly listeners = new Set<(comments: Comment[]) => void>();
  private chunks: Unsubscribe[] = [];
  private visible = new Set<string>();
  private unsubscribeScope: (() => void) | null = null;
  private unregister: (() => void) | null = null;
  private snapshot: Comment[] = [];

  constructor(
    private readonly db: Firestore,
    private readonly scope: FriendScope,
    private readonly post: { id: string; authorId: string },
    private readonly options: { chunkSize?: number; onError?: (err: Error) => void } = {},
  ) {}

  get comments(): Comment[] {
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

  subscribe(listener: (comments: Comment[]) => void): () => void {
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
          query(commentsOf(this.db, this.post.id), where("authorId", "in", chunk)),
          (snap) => {
            const fresh = new Map<string, Comment[]>(chunk.filter((a) => this.visible.has(a)).map((a) => [a, []]));
            for (const d of snap.docs) {
              const data = d.data({ serverTimestamps: "estimate" });
              const list = fresh.get(data.authorId);
              if (!list) continue; // evicted while this snapshot was in flight
              list.push({
                id: d.id,
                postId: this.post.id,
                authorId: data.authorId,
                text: data.text,
                createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? new Date(),
              });
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
