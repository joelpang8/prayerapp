import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { FriendScope, FriendScopedCache } from "./friendScope";
import { parseBirthday } from "./profile";

/**
 * Friends' birthdays for the "Birthdays today" card on Today. Uses only the
 * month and day friends already share in their friends-only details (read
 * with the same rules: current mutual friends only). Kept in memory only,
 * registered with FriendScope: a removed friend's birthday is dropped at
 * once, and everything on sign-out.
 */
export class BirthdayStore implements FriendScopedCache {
  /** uid -> "MM-DD", or null when they haven't shared one. */
  private readonly days = new Map<string, string | null>();
  private readonly listeners = new Set<() => void>();
  private unregister: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly db: Firestore, private readonly scope: FriendScope) {}

  start(): void {
    if (this.unregister) return;
    this.unregister = this.scope.register(this);
    this.unsubscribe = this.scope.subscribe((graph) => {
      for (const uid of graph.friends) if (!this.days.has(uid)) void this.load(uid);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unregister?.();
    this.unsubscribe = this.unregister = null;
    this.clear();
  }

  private async load(uid: string): Promise<void> {
    this.days.set(uid, null);
    try {
      const snap = await getDoc(doc(this.db, "users", uid, "friendsOnly", "about"));
      if (!this.scope.isFriend(uid)) return; // removed while loading
      const b = parseBirthday(String(snap.data()?.birthday ?? ""));
      this.days.set(uid, b ? `${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}` : null);
      this.publish();
    } catch {
      // Not readable (e.g. no longer friends): nothing to show.
    }
  }

  /** Friends whose birthday is on `date` (the phone's own day). */
  today(date: Date): string[] {
    return [...this.days].filter(([uid, md]) => md && this.scope.isFriend(uid) && isBirthdayOn(md, date)).map(([uid]) => uid);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  evictAuthor(uid: string): void {
    this.days.delete(uid);
    this.publish();
  }

  clear(): void {
    this.days.clear();
    this.publish();
  }

  private publish() {
    for (const l of this.listeners) l();
  }
}

const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/** "MM-DD" falls on `date` (local). 29 February is celebrated on the 28th in other years. */
export function isBirthdayOn(md: string, date: Date): boolean {
  const [m, d] = md.split("-").map(Number);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (m === 2 && d === 29 && !isLeap(date.getFullYear())) return month === 2 && day === 28;
  return m === month && d === day;
}
