import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Query,
  type Unsubscribe,
} from "firebase/firestore";
import type { FriendScope, FriendScopedCache } from "./friendScope";
import type { PrayerRequest } from "./prayerRequests";

/**
 * "I'll pray for this": a friend taps one of my prayer requests to say
 * they're praying for it. Stored at users/{owner}/prayingFor/{itemId}_{friend}.
 * Only current mutual friends can tap (firestore.rules), nothing is sent to
 * the owner, and only the owner can read who tapped. Other friends never see
 * taps or counts. Everything here is memory-only and registered with
 * FriendScope, like all other people's content on the phone.
 */
export type PrayerTap = { friendUid: string; itemId: string };

const tapsOf = (db: Firestore, owner: string) => collection(db, "users", owner, "prayingFor");
export const tapId = (itemId: string, friendUid: string) => `${itemId}_${friendUid}`;

export function prayFor(db: Firestore, owner: string, me: string, itemId: string): Promise<void> {
  return setDoc(doc(tapsOf(db, owner), tapId(itemId, me)), { friendUid: me, itemId, createdAt: serverTimestamp() });
}

export function stopPraying(db: Firestore, owner: string, me: string, itemId: string): Promise<void> {
  return deleteDoc(doc(tapsOf(db, owner), tapId(itemId, me)));
}

/**
 * For each of my current requests, the current friends praying for it.
 * Taps from people who aren't friends any more, or on requests I've removed
 * or reworded, don't count (Cloud Functions also delete them).
 */
export function prayingByRequest(
  taps: readonly PrayerTap[],
  requests: readonly PrayerRequest[],
  isFriend: (uid: string) => boolean,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of requests) if (r.id) out.set(r.id, []);
  for (const t of taps) {
    const list = out.get(t.itemId);
    if (list && isFriend(t.friendUid) && !list.includes(t.friendUid)) list.push(t.friendUid);
  }
  return out;
}

/** "1 friend is praying for this", "3 friends are praying for this". */
export function prayingCountText(n: number): string {
  return n === 1 ? "1 friend is praying for this" : `${n} friends are praying for this`;
}

/** "Ana is praying for this", "Ana and Ben are…", "Ana, Ben and Cy are…". */
export function prayingNamesText(names: readonly string[]): string {
  if (names.length === 0) return "";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} ${names.length === 1 ? "is" : "are"} praying for this`;
}

abstract class TapListener implements FriendScopedCache {
  protected taps: PrayerTap[] = [];
  private readonly listeners = new Set<(taps: PrayerTap[]) => void>();
  private unsubscribe: Unsubscribe | null = null;
  private unregister: (() => void) | null = null;

  constructor(
    protected readonly db: Firestore,
    protected readonly scope: FriendScope,
    private readonly onError: (err: Error) => void,
  ) {}

  protected abstract canListen(): boolean;
  protected abstract source(): Query;

  start(): void {
    if (this.unsubscribe || !this.canListen()) return;
    this.unregister = this.scope.register(this);
    this.unsubscribe = onSnapshot(
      this.source(),
      (snap) => {
        this.taps = snap.docs.map((d) => ({ friendUid: String(d.get("friendUid")), itemId: String(d.get("itemId")) }));
        this.publish();
      },
      (err) => {
        this.clear();
        this.onError(err);
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unregister?.();
    this.unregister = null;
    this.clear();
  }

  subscribe(listener: (taps: PrayerTap[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.taps);
    return () => this.listeners.delete(listener);
  }

  abstract evictAuthor(uid: string): void;

  clear(): void {
    this.taps = [];
    this.publish();
  }

  protected publish(): void {
    for (const l of this.listeners) l(this.taps);
  }
}

/**
 * Who's praying for my requests (the owner's view). A friend who's removed
 * is dropped from memory at once, before the server deletes their taps.
 */
export class PrayingForMe extends TapListener {
  protected canListen() {
    return true;
  }

  protected source() {
    return tapsOf(this.db, this.scope.me);
  }

  evictAuthor(uid: string): void {
    if (!this.taps.some((t) => t.friendUid === uid)) return;
    this.taps = this.taps.filter((t) => t.friendUid !== uid);
    this.publish();
  }
}

/**
 * Which of a friend's requests I'm praying for, so the button shows it.
 * Only while we're friends: if the friendship ends, the listener stops and
 * the state is forgotten.
 */
export class MyPrayersFor extends TapListener {
  constructor(db: Firestore, scope: FriendScope, private readonly owner: string, onError: (err: Error) => void) {
    super(db, scope, onError);
  }

  protected canListen() {
    return this.owner !== this.scope.me && this.scope.isFriend(this.owner);
  }

  protected source() {
    return query(tapsOf(this.db, this.owner), where("friendUid", "==", this.scope.me));
  }

  evictAuthor(uid: string): void {
    if (uid === this.owner) this.stop();
  }
}
