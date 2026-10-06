import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import type { Prompt } from "./prompts";

/** 2-minute response window + 5-minute grace period. Must match firestore.rules. */
export const ON_TIME_WINDOW_MS = 7 * 60 * 1000;
export const MAX_NOTES = 2000;
export const MAX_PLACE = 80; // must match firestore.rules

export type Post = {
  id: string;
  authorId: string;
  promptId: string;
  promptFiredAt: Date;
  createdAt: Date;
  editedAt: Date | null;
  notes: string;
  photoPath: string;
  /** The prompt's verse reference (never text); null if the prompt had none. */
  verseRef: string | null;
  /** Where it was posted, as a place name like "Austin, Texas"; opt-in, never coordinates. */
  place: string | null;
};

/**
 * Late is derived, never stored: both timestamps are pinned by the rules
 * (createdAt = server time at posting, promptFiredAt = the prompt's time),
 * so it can't be faked, and editing a post can't change it.
 * It is a label only; nothing ranks or counts by it.
 */
export function isLate(post: Pick<Post, "createdAt" | "promptFiredAt">): boolean {
  return post.createdAt.getTime() - post.promptFiredAt.getTime() > ON_TIME_WINDOW_MS;
}

export function notesProblem(notes: string): string | null {
  const trimmed = notes.trim();
  if (!trimmed) return "Write a few words about what you prayed for.";
  if (trimmed.length > MAX_NOTES) return `At most ${MAX_NOTES} characters.`;
  return null;
}

export const postIdFor = (promptId: string, uid: string) => `${promptId}_${uid}`;

/** Photo ids must match storage.rules: [A-Za-z0-9]{1,64}.jpg */
export function photoPathFor(uid: string, photoId: string): string {
  if (!/^[A-Za-z0-9]{1,64}$/.test(photoId)) throw new Error(`bad photo id: ${photoId}`);
  return `postPhotos/${uid}/${photoId}.jpg`;
}

export function postFromSnapshot(snap: DocumentSnapshot): Post | null {
  // "estimate" fills in a pending serverTimestamp with the local clock
  // until the server confirms it.
  const d = snap.data({ serverTimestamps: "estimate" });
  if (!d) return null;
  const date = (t: Timestamp | null | undefined) => (t ? t.toDate() : null);
  return {
    id: snap.id,
    authorId: d.authorId,
    promptId: d.promptId,
    promptFiredAt: date(d.promptFiredAt)!,
    createdAt: date(d.createdAt) ?? new Date(),
    editedAt: date(d.editedAt),
    notes: d.notes,
    photoPath: d.photoPath,
    verseRef: d.verseRef ?? null,
    place: typeof d.place === "string" ? d.place : null,
  };
}

/**
 * JPEG bytes to upload. In the app this must be a native Blob (see
 * capture.ts): React Native's Blob can't be built from raw bytes, and
 * Firebase's upload builds one internally. Tests in Node pass a Uint8Array.
 */
export type PhotoData = Blob | Uint8Array;

async function uploadPhoto(storage: FirebaseStorage, path: string, jpeg: PhotoData) {
  await uploadBytes(ref(storage, path), jpeg, { contentType: "image/jpeg" });
}

export type NewPost = {
  uid: string;
  prompt: Prompt;
  notes: string;
  jpeg: PhotoData;
  photoId: string;
  /** Opt-in place name from location.ts; omit for none. */
  place?: string | null;
};

/**
 * Upload the photo, then create the post. The post's time (and so on-time vs
 * late) is when the post document is written, i.e. after the upload.
 * If creating the post fails, the uploaded photo is removed.
 */
export async function createPost(db: Firestore, storage: FirebaseStorage, p: NewPost): Promise<string> {
  const problem = notesProblem(p.notes);
  if (problem) throw new Error(problem);
  const photoPath = photoPathFor(p.uid, p.photoId);
  await uploadPhoto(storage, photoPath, p.jpeg);
  const id = postIdFor(p.prompt.id, p.uid);
  try {
    await setDoc(doc(db, "posts", id), {
      authorId: p.uid,
      promptId: p.prompt.id,
      promptFiredAt: Timestamp.fromDate(p.prompt.firedAt),
      createdAt: serverTimestamp(),
      notes: p.notes.trim(),
      photoPath,
      // Carried from the prompt; the rules require it to match exactly.
      ...(p.prompt.verseRef ? { verseRef: p.prompt.verseRef } : {}),
      ...(p.place ? { place: p.place.slice(0, MAX_PLACE) } : {}),
    });
  } catch (err) {
    await deleteObject(ref(storage, photoPath)).catch(() => {});
    throw err;
  }
  return id;
}

export type PostEdit = {
  notes?: string;
  newPhoto?: { jpeg: PhotoData; photoId: string };
  /** The place can only be removed after posting, not added or changed. */
  removePlace?: boolean;
};

/**
 * Edit notes and/or replace the photo. Marks the post edited. The old photo
 * is deleted by a Cloud Function once the post points at the new one.
 */
export async function editPost(db: Firestore, storage: FirebaseStorage, post: Post, edit: PostEdit): Promise<void> {
  const notes = edit.notes ?? post.notes;
  const problem = notesProblem(notes);
  if (problem) throw new Error(problem);
  let photoPath = post.photoPath;
  if (edit.newPhoto) {
    photoPath = photoPathFor(post.authorId, edit.newPhoto.photoId);
    await uploadPhoto(storage, photoPath, edit.newPhoto.jpeg);
  }
  try {
    await updateDoc(doc(db, "posts", post.id), {
      notes: notes.trim(),
      photoPath,
      editedAt: serverTimestamp(),
      ...(edit.removePlace && post.place ? { place: deleteField() } : {}),
    });
  } catch (err) {
    if (photoPath !== post.photoPath) await deleteObject(ref(storage, photoPath)).catch(() => {});
    throw err;
  }
}

/** Deletes the post; its photo is deleted by a Cloud Function. */
export function deletePost(db: Firestore, post: Pick<Post, "id">): Promise<void> {
  return deleteDoc(doc(db, "posts", post.id));
}

/** My own posts, newest first (personal history). */
export function watchMyPosts(
  db: Firestore,
  uid: string,
  onPosts: (posts: Post[]) => void,
  max = 50,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "posts"), where("authorId", "==", uid), orderBy("createdAt", "desc"), limit(max)),
    (snap) => onPosts(snap.docs.map(postFromSnapshot).filter((p): p is Post => !!p)),
    onError,
  );
}
