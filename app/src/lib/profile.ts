import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import type { PhotoData } from "./posts";

/**
 * Public profile: visible to any signed-in user who knows the uid.
 * The bio is NOT here; it's friends-only (see watchBio).
 */
export type Profile = {
  uid: string;
  username: string;
  displayName: string;
  /** avatars/{uid}/{id}.jpg, or null for no photo. */
  avatarPath: string | null;
};

export const BIO_MAX = 160; // must match firestore.rules

export function bioProblem(bio: string): string | null {
  return bio.trim().length > BIO_MAX ? `At most ${BIO_MAX} characters.` : null;
}

export function avatarPathFor(uid: string, avatarId: string): string {
  if (!/^[A-Za-z0-9]{1,64}$/.test(avatarId)) throw new Error(`bad avatar id: ${avatarId}`);
  return `avatars/${uid}/${avatarId}.jpg`;
}

export function profileFromData(uid: string, data: Record<string, unknown>): Profile {
  return {
    uid,
    username: data.username as string,
    displayName: data.displayName as string,
    avatarPath: typeof data.avatarPath === "string" ? data.avatarPath : null,
  };
}

/** "Mary Anne Smith" -> "MS"; shown when someone has no profile photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const ends = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return ends.map((w) => [...w][0]).join("").toUpperCase();
}

// Must match isValidUsername() in firebase/firestore.rules.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function usernameProblem(username: string): string | null {
  if (username.length < 3) return "At least 3 characters.";
  if (username.length > 20) return "At most 20 characters.";
  if (!USERNAME_PATTERN.test(username)) return "Only lowercase letters, numbers and underscores.";
  return null;
}

export function displayNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1) return "Enter a name.";
  if (trimmed.length > 50) return "At most 50 characters.";
  return null;
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`@${username} is taken`);
    this.name = "UsernameTakenError";
  }
}

/** Creates the profile and claims the username atomically (the rules require both in one batch). */
export async function createProfile(
  db: Firestore,
  uid: string,
  username: string,
  displayName: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), {
    username,
    displayName: displayName.trim(),
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "usernames", username), { uid });
  try {
    await batch.commit();
  } catch (err) {
    // A taken username and a bad write both surface as permission-denied;
    // check which one it was so the UI can say something useful.
    if (await getDoc(doc(db, "usernames", username)).then((s) => s.exists(), () => false)) {
      throw new UsernameTakenError(username);
    }
    throw err;
  }
}

export async function getProfile(db: Firestore, uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return profileFromData(uid, snap.data());
}

/**
 * Upload a new profile photo, then point the profile at it. The previous
 * photo is deleted by a Cloud Function once the profile no longer uses it.
 */
export async function setAvatar(db: Firestore, storage: FirebaseStorage, uid: string, jpeg: PhotoData, avatarId: string): Promise<string> {
  const path = avatarPathFor(uid, avatarId);
  await uploadBytes(ref(storage, path), jpeg, { contentType: "image/jpeg" });
  await updateDoc(doc(db, "users", uid), { avatarPath: path });
  return path;
}

export function removeAvatar(db: Firestore, uid: string): Promise<void> {
  return updateDoc(doc(db, "users", uid), { avatarPath: deleteField() });
}

const aboutDoc = (db: Firestore, uid: string) => doc(db, "users", uid, "friendsOnly", "about");

/**
 * A user's bio, live. Readable only by them and their current mutual
 * friends; anyone else gets permission-denied (reported via onError).
 * A user with no bio yet gives "".
 */
export function watchBio(
  db: Firestore,
  uid: string,
  onBio: (bio: string) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    aboutDoc(db, uid),
    (snap) => onBio(typeof snap.data()?.bio === "string" ? snap.data()!.bio : ""),
    onError,
  );
}

export async function saveBio(db: Firestore, uid: string, bio: string): Promise<void> {
  const problem = bioProblem(bio);
  if (problem) throw new Error(problem);
  await setDoc(aboutDoc(db, uid), { bio: bio.trim() });
}

export async function findByUsername(db: Firestore, input: string): Promise<Profile | null> {
  const username = normalizeUsername(input);
  if (usernameProblem(username)) return null;
  const claim = await getDoc(doc(db, "usernames", username));
  if (!claim.exists()) return null;
  return getProfile(db, claim.data().uid);
}
