/**
 * Posts waiting to send. The on-time window is short, so a post made while
 * the connection is down is saved on the phone (it's my own post, so keeping
 * it on the device is fine) and sent as soon as it can be. When it arrives,
 * the server decides on time vs late, as for any post; the post also
 * records when the photo was taken (takenAt), shown as "Taken 3:02".
 */
import type { Visibility } from "./posts";

export type QueuedPost = {
  /** posts/{promptId}_{uid}: one per prompt, so it also identifies the post. */
  postId: string;
  uid: string;
  prompt: { id: string; firedAt: number; verseRef: string | null };
  notes: string;
  /** The JPEG in the app's cache folder. */
  photoUri: string;
  photoId: string;
  place: string | null;
  visibility: Visibility;
  takenAt: number;
  /** waiting: will retry. failed: won't send (e.g. the prompt closed); needs Retry or Discard. */
  status: "waiting" | "sending" | "failed";
  problem?: string;
};

export interface OutboxStorage {
  load(uid: string): Promise<QueuedPost[]>;
  save(uid: string, items: QueuedPost[]): Promise<void>;
}

export interface OutboxSender {
  /** Whether the post already exists on the server (an earlier attempt landed). */
  exists(postId: string): Promise<boolean>;
  send(item: QueuedPost): Promise<void>;
}

/** Errors that retrying won't fix. Anything else (offline, timeouts) is retried. */
export function isPermanent(err: unknown): string | null {
  const code = String((err as { code?: string })?.code ?? "");
  const message = String((err as Error)?.message ?? "");
  if (code === "permission-denied" || code === "storage/unauthorized") {
    return "The server didn't accept it. The prompt may have closed (posts are open for 24 hours).";
  }
  if (code === "invalid-argument" || code === "storage/invalid-argument") return "Something about this post isn't valid.";
  if (code === "photo-missing" || /photo is no longer/i.test(message)) return "The photo is no longer on this phone.";
  return null;
}

export class Outbox {
  private items: QueuedPost[] = [];
  private readonly listeners = new Set<(items: QueuedPost[]) => void>();
  private flushing: Promise<void> | null = null;
  private loaded = false;

  constructor(
    private readonly uid: string,
    private readonly storage: OutboxStorage,
    private readonly sender: OutboxSender,
  ) {}

  get all(): QueuedPost[] {
    return this.items;
  }

  get hasWaiting(): boolean {
    return this.items.some((i) => i.status === "waiting");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    // A send interrupted by the app closing is simply tried again.
    const saved = await this.storage.load(this.uid).catch(() => []);
    this.items = saved.map((i) => (i.status === "sending" ? { ...i, status: "waiting" } : i));
    this.publish();
  }

  subscribe(listener: (items: QueuedPost[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.items);
    return () => this.listeners.delete(listener);
  }

  /** Save a post to send, then try to send it straight away. */
  async enqueue(item: Omit<QueuedPost, "status" | "problem">): Promise<void> {
    await this.load();
    this.items = [...this.items.filter((i) => i.postId !== item.postId), { ...item, status: "waiting" }];
    await this.persist();
    void this.flush();
  }

  async retry(postId: string): Promise<void> {
    this.update(postId, { status: "waiting", problem: undefined });
    await this.persist();
    void this.flush();
  }

  async discard(postId: string): Promise<void> {
    this.items = this.items.filter((i) => i.postId !== postId);
    await this.persist();
    this.publish();
  }

  /** Try every waiting post once. Safe to call often; runs one at a time. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.flushOnce().finally(() => { this.flushing = null; });
    }
    return this.flushing;
  }

  private async flushOnce(): Promise<void> {
    await this.load();
    for (const item of this.items.filter((i) => i.status === "waiting")) {
      this.update(item.postId, { status: "sending" });
      try {
        // An earlier attempt may have reached the server just before the
        // app closed; posting again would be refused (one post per prompt).
        if (!(await this.sender.exists(item.postId))) await this.sender.send(item);
        this.items = this.items.filter((i) => i.postId !== item.postId);
        this.publish();
      } catch (err) {
        const problem = isPermanent(err);
        this.update(item.postId, problem ? { status: "failed", problem } : { status: "waiting" });
      }
      await this.persist();
    }
  }

  private update(postId: string, patch: Partial<QueuedPost>): void {
    this.items = this.items.map((i) => (i.postId === postId ? { ...i, ...patch } : i));
    this.publish();
  }

  private persist(): Promise<void> {
    return this.storage.save(this.uid, this.items).catch(() => {});
  }

  private publish(): void {
    for (const l of this.listeners) l(this.items);
  }
}
