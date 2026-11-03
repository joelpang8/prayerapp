import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, type DocumentData, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import type { PhotoData } from "./posts";

/**
 * Prayer circles: small named groups with a shared prayer list.
 *  - circles/{id}: { name, leaderId, memberIds, invitedIds, createdAt, photoPath? }
 *  - circlePhotos/{circleId}/{photoId}.jpg in Storage: the circle's photo,
 *    seen by members and invited people, set by the leader
 *  - circles/{id}/circleRequests/{id}: { authorId, text, createdAt, prayedBy, answeredAt?, answerNote? }
 * Members see each other's names and the circle's requests even if they
 * aren't friends; nothing else (profiles, posts) is shared through a circle.
 * Only the leader invites, one friend at a time; nobody is in until they
 * accept. firestore.rules enforces all of it; this file only makes the
 * writes the rules allow. Nothing here is kept on the phone: it's live
 * from Firestore while a screen shows it (memory only).
 */

/** Must match firestore.rules. */
export const CIRCLE_NAME_MAX = 40;
export const MAX_CIRCLE_PEOPLE = 30;
export const CIRCLE_REQUEST_MAX = 300;
export const CIRCLE_ANSWER_NOTE_MAX = 120;

/** A weekly time the circle prays together: 1 = Monday ... 7 = Sunday, in the leader's time zone. */
export type PrayerTime = { weekday: number; hour: number; minute: number; timeZone: string };

export type Circle = {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  invitedIds: string[];
  photoPath: string | null;
  pinnedRequestId: string | null;
  prayerTime: PrayerTime | null;
};

function prayerTimeFrom(v: unknown): PrayerTime | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const ok = (n: unknown, lo: number, hi: number) => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
  if (!ok(p.weekday, 1, 7) || !ok(p.hour, 0, 23) || !ok(p.minute, 0, 59) || typeof p.timeZone !== "string") return null;
  return { weekday: p.weekday as number, hour: p.hour as number, minute: p.minute as number, timeZone: p.timeZone };
}

export type CircleRequest = {
  id: string;
  authorId: string;
  text: string;
  createdAt: Date | null;
  prayedBy: string[];
  answered: { at: Date | null; note: string } | null;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const date = (v: unknown): Date | null => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate: () => Date }).toDate() : null);

export function circleFromData(id: string, d: DocumentData): Circle {
  return {
    id, name: String(d.name ?? ""), leaderId: String(d.leaderId ?? ""), memberIds: strings(d.memberIds), invitedIds: strings(d.invitedIds),
    photoPath: typeof d.photoPath === "string" ? d.photoPath : null,
    pinnedRequestId: typeof d.pinnedRequestId === "string" ? d.pinnedRequestId : null,
    prayerTime: prayerTimeFrom(d.prayerTime),
  };
}

export function requestFromData(id: string, d: DocumentData): CircleRequest {
  return {
    id,
    authorId: String(d.authorId ?? ""),
    text: String(d.text ?? ""),
    createdAt: date(d.createdAt),
    prayedBy: strings(d.prayedBy),
    answered: d.answeredAt !== undefined ? { at: date(d.answeredAt), note: typeof d.answerNote === "string" ? d.answerNote : "" } : null,
  };
}

/** A circle's name, trimmed, or a problem to show. */
export function circleNameProblem(name: string): "empty" | "long" | null {
  const n = name.trim();
  if (!n) return "empty";
  if (n.length > CIRCLE_NAME_MAX) return "long";
  return null;
}

/** How many more people the leader can invite. */
export function invitesLeft(c: Pick<Circle, "memberIds" | "invitedIds">): number {
  return Math.max(0, MAX_CIRCLE_PEOPLE - c.memberIds.length - c.invitedIds.length);
}

/**
 * Requests to show me: newest first, without anything from people I've
 * blocked (they're never told) or that I've reported.
 */
export function visibleRequests(requests: readonly CircleRequest[], blocked: ReadonlySet<string>, hidden: (requestId: string) => boolean): CircleRequest[] {
  return requests.filter((r) => !blocked.has(r.authorId) && !hidden(r.id));
}

/**
 * How a circle's list is shown: the pinned request first (if it's still
 * there and not answered), then the open ones, newest first, then a separate
 * "Answered" section, most recently answered first.
 */
export function arrangeRequests(requests: readonly CircleRequest[], pinnedId: string | null): { pinned: CircleRequest | null; open: CircleRequest[]; answered: CircleRequest[] } {
  const pinned = requests.find((r) => r.id === pinnedId && !r.answered) ?? null;
  const open = requests.filter((r) => !r.answered && r !== pinned);
  const answered = requests
    .filter((r) => r.answered)
    .sort((a, b) => (b.answered!.at?.getTime() ?? 0) - (a.answered!.at?.getTime() ?? 0));
  return { pinned, open, answered };
}

const circleRef = (db: Firestore, id: string) => doc(db, "circles", id);
const requestsOf = (db: Firestore, circleId: string) => collection(db, "circles", circleId, "circleRequests");

/** Circles I'm in, live. */
export function watchMyCircles(db: Firestore, uid: string, on: (circles: Circle[]) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(query(collection(db, "circles"), where("memberIds", "array-contains", uid)),
    (snap) => on(snap.docs.map((d) => circleFromData(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))), onError);
}

/** Circles I've been invited to, live. */
export function watchCircleInvites(db: Firestore, uid: string, on: (circles: Circle[]) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(query(collection(db, "circles"), where("invitedIds", "array-contains", uid)),
    (snap) => on(snap.docs.map((d) => circleFromData(d.id, d.data()))), onError);
}

/** One circle, live (null once it's gone or I'm no longer in it). */
export function watchCircle(db: Firestore, id: string, on: (c: Circle | null) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(circleRef(db, id), (snap) => on(snap.exists() ? circleFromData(snap.id, snap.data()) : null), onError);
}

/** A circle's requests, newest first, live. */
export function watchCircleRequests(db: Firestore, circleId: string, on: (r: CircleRequest[]) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(query(requestsOf(db, circleId), orderBy("createdAt", "desc"), limit(100)),
    (snap) => on(snap.docs.map((d) => requestFromData(d.id, d.data({ serverTimestamps: "estimate" })))), onError);
}

/** When the newest request was added (for the "new" dot), live. */
export function watchNewestRequest(db: Firestore, circleId: string, on: (r: CircleRequest | null) => void): Unsubscribe {
  return onSnapshot(query(requestsOf(db, circleId), orderBy("createdAt", "desc"), limit(1)),
    (snap) => on(snap.docs[0] ? requestFromData(snap.docs[0].id, snap.docs[0].data({ serverTimestamps: "estimate" })) : null), () => on(null));
}

/** Starts a circle with me as leader, then invites each friend (one write each, as the rules require). */
export async function createCircle(db: Firestore, me: string, name: string, invite: readonly string[]): Promise<string> {
  const ref = doc(collection(db, "circles"));
  await setDoc(ref, { name: name.trim(), leaderId: me, memberIds: [me], invitedIds: [], createdAt: serverTimestamp() });
  for (const uid of invite.slice(0, MAX_CIRCLE_PEOPLE - 1)) await inviteToCircle(db, ref.id, uid);
  return ref.id;
}

export function inviteToCircle(db: Firestore, circleId: string, uid: string): Promise<void> {
  return updateDoc(circleRef(db, circleId), { invitedIds: arrayUnion(uid) });
}

export function cancelInvite(db: Firestore, circleId: string, uid: string): Promise<void> {
  return updateDoc(circleRef(db, circleId), { invitedIds: arrayRemove(uid) });
}

export function acceptInvite(db: Firestore, circleId: string, me: string): Promise<void> {
  return updateDoc(circleRef(db, circleId), { invitedIds: arrayRemove(me), memberIds: arrayUnion(me) });
}

export function declineInvite(db: Firestore, circleId: string, me: string): Promise<void> {
  return updateDoc(circleRef(db, circleId), { invitedIds: arrayRemove(me) });
}

/** The leader pins a request to the top (or unpins with null). */
export function pinRequest(db: Firestore, circleId: string, requestId: string | null): Promise<void> {
  return updateDoc(circleRef(db, circleId), { pinnedRequestId: requestId ?? deleteField() });
}

/** The leader sets the weekly prayer time (or clears it with null). */
export function setPrayerTime(db: Firestore, circleId: string, time: PrayerTime | null): Promise<void> {
  return updateDoc(circleRef(db, circleId), { prayerTime: time ?? deleteField() });
}

export function renameCircle(db: Firestore, circleId: string, name: string): Promise<void> {
  return updateDoc(circleRef(db, circleId), { name: name.trim() });
}

/** Their requests in this circle (to remove with them). */
async function deleteRequestsBy(db: Firestore, circleId: string, authorId: string): Promise<void> {
  const snap = await getDocs(query(requestsOf(db, circleId), where("authorId", "==", authorId)));
  for (const d of snap.docs) await deleteDoc(d.ref);
}

/** I leave: my requests in it go too. */
export async function leaveCircle(db: Firestore, circleId: string, me: string): Promise<void> {
  await deleteRequestsBy(db, circleId, me);
  await updateDoc(circleRef(db, circleId), { memberIds: arrayRemove(me) });
}

/** The leader removes someone: their requests in it go too. */
export async function removeMember(db: Firestore, circleId: string, uid: string): Promise<void> {
  await deleteRequestsBy(db, circleId, uid);
  await updateDoc(circleRef(db, circleId), { memberIds: arrayRemove(uid) });
}

export function circlePhotoPath(circleId: string, photoId: string): string {
  if (!/^[A-Za-z0-9]{1,64}$/.test(photoId)) throw new Error(`bad photo id: ${photoId}`);
  return `circlePhotos/${circleId}/${photoId}.jpg`;
}

/** The leader sets a new photo; the old one (if any) is deleted after. */
export async function setCirclePhoto(db: Firestore, storage: FirebaseStorage, circle: Pick<Circle, "id" | "photoPath">, jpeg: PhotoData, photoId: string): Promise<void> {
  const path = circlePhotoPath(circle.id, photoId);
  await uploadBytes(ref(storage, path), jpeg, { contentType: "image/jpeg" });
  await updateDoc(circleRef(db, circle.id), { photoPath: path });
  if (circle.photoPath && circle.photoPath !== path) await deleteObject(ref(storage, circle.photoPath)).catch(() => {});
}

/** The leader removes the photo. */
export async function removeCirclePhoto(db: Firestore, storage: FirebaseStorage, circle: Pick<Circle, "id" | "photoPath">): Promise<void> {
  await updateDoc(circleRef(db, circle.id), { photoPath: deleteField() });
  if (circle.photoPath) await deleteObject(ref(storage, circle.photoPath)).catch(() => {});
}

/** The leader deletes the circle, its photo and every request in it. */
export async function deleteCircle(db: Firestore, circleId: string, photo?: { storage: FirebaseStorage; path: string | null }): Promise<void> {
  if (photo?.path) await deleteObject(ref(photo.storage, photo.path)).catch(() => {});
  const snap = await getDocs(requestsOf(db, circleId));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  await deleteDoc(circleRef(db, circleId));
}

export async function addCircleRequest(db: Firestore, circleId: string, me: string, text: string): Promise<void> {
  await addDoc(requestsOf(db, circleId), { authorId: me, text: text.trim().slice(0, CIRCLE_REQUEST_MAX), createdAt: serverTimestamp(), prayedBy: [] });
}

export function setPrayed(db: Firestore, circleId: string, requestId: string, me: string, prayed: boolean): Promise<void> {
  return updateDoc(doc(requestsOf(db, circleId), requestId), { prayedBy: prayed ? arrayUnion(me) : arrayRemove(me) });
}

/** The author marks it answered (note may be empty), or undoes that (note null). */
export function setCircleRequestAnswered(db: Firestore, circleId: string, requestId: string, note: string | null): Promise<void> {
  const ref = doc(requestsOf(db, circleId), requestId);
  if (note === null) return updateDoc(ref, { answeredAt: deleteField(), answerNote: deleteField() });
  const trimmed = note.trim().slice(0, CIRCLE_ANSWER_NOTE_MAX);
  return updateDoc(ref, { answeredAt: serverTimestamp(), ...(trimmed ? { answerNote: trimmed } : {}) });
}

export function deleteCircleRequest(db: Firestore, circleId: string, requestId: string): Promise<void> {
  return deleteDoc(doc(requestsOf(db, circleId), requestId));
}
