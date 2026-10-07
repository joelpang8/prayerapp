import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

/** Must match firestore.rules (reports). */
export const REPORT_REASONS = [
  { id: "spam", label: "Spam" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "harm", label: "Someone may be at risk of harm" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export type ReportTarget =
  | { kind: "user"; targetUid: string }
  | { kind: "post"; targetUid: string; postId: string; excerpt?: string }
  | { kind: "comment"; targetUid: string; postId: string; commentId: string; excerpt?: string };

/** The key in users/{me}/hidden for a reported post or comment. */
export function hiddenKey(t: { postId: string; commentId?: string }): string {
  return t.commentId ? `comment_${t.postId}_${t.commentId}` : `post_${t.postId}`;
}

/**
 * File a report for the project owner to review (in the Firebase console;
 * nobody can read reports from the app). A reported post or comment is also
 * hidden from my own view straight away.
 */
export async function fileReport(db: Firestore, me: string, target: ReportTarget, reason: ReportReason, note?: string): Promise<void> {
  const trimmed = note?.trim();
  await addDoc(collection(db, "reports"), {
    reporter: me,
    kind: target.kind,
    targetUid: target.targetUid,
    ...(target.kind !== "user" ? { postId: target.postId } : {}),
    ...(target.kind === "comment" ? { commentId: target.commentId } : {}),
    ...(target.kind !== "user" && target.excerpt ? { excerpt: target.excerpt.slice(0, 2000) } : {}),
    reason,
    ...(trimmed ? { note: trimmed.slice(0, 500) } : {}),
    createdAt: serverTimestamp(),
  });
  if (target.kind !== "user") await hide(db, me, target);
}

export function hide(db: Firestore, me: string, t: { postId: string; commentId?: string }): Promise<void> {
  return setDoc(doc(db, "users", me, "hidden", hiddenKey(t)), { createdAt: serverTimestamp() });
}

/** The keys of everything I've hidden, live. */
export function watchHidden(db: Firestore, me: string, onKeys: (keys: ReadonlySet<string>) => void, onError: (err: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(collection(db, "users", me, "hidden"), (snap) => onKeys(new Set(snap.docs.map((d) => d.id))), onError);
}

/**
 * Block someone: record the block and end the friendship (or pending
 * request) in one batch. Only edges that exist are deleted: the rules refuse
 * deleting a missing one, which would fail the whole batch. They're not told.
 */
export async function blockUser(
  db: Firestore,
  me: string,
  them: string,
  edges: { iFollowThem: boolean; theyFollowMe: boolean },
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "blocks", `${me}_${them}`), { blocker: me, blocked: them, createdAt: serverTimestamp() });
  if (edges.iFollowThem) batch.delete(doc(db, "follows", `${me}_${them}`));
  if (edges.theyFollowMe) batch.delete(doc(db, "follows", `${them}_${me}`));
  await batch.commit();
}

export function unblockUser(db: Firestore, me: string, them: string): Promise<void> {
  return deleteDoc(doc(db, "blocks", `${me}_${them}`));
}

/** The people I've blocked, live. */
export function watchBlocked(db: Firestore, me: string, onBlocked: (uids: ReadonlySet<string>) => void, onError: (err: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(
    query(collection(db, "blocks"), where("blocker", "==", me)),
    (snap) => onBlocked(new Set(snap.docs.map((d) => d.data().blocked as string))),
    onError,
  );
}
