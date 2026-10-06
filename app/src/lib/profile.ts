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
 * The friends-only part of a profile. Every field is optional; "" means not
 * filled in (and isn't stored).
 */
export type About = {
  bio: string;
  /** "MM-DD", or "YYYY-MM-DD" if they share the year. */
  birthday: string;
  /** Where they're from, e.g. "Lagos, Nigeria". */
  hometown: string;
  prayerRequests: string;
  bibleVersion: string;
  denomination: string;
  church: string;
};

export const EMPTY_ABOUT: About = { bio: "", birthday: "", hometown: "", prayerRequests: "", bibleVersion: "", denomination: "", church: "" };

// Must match firestore.rules.
export const ABOUT_LIMITS: Record<Exclude<keyof About, "birthday">, number> = {
  bio: BIO_MAX,
  hometown: 80,
  prayerRequests: 500,
  bibleVersion: 40,
  denomination: 60,
  church: 80,
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTHS[m - 1];

/** Days in a month; February allows the 29th, since the year is optional. */
export function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 28 : 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** {month, day, year?} -> "MM-DD" / "YYYY-MM-DD", or null if it isn't a real date. */
export function birthdayValue(month: number, day: number, year?: number): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month, year)) return null;
  const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return year ? `${year}-${md}` : md;
}

export function parseBirthday(value: string): { month: number; day: number; year?: number } | null {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: m[1] ? Number(m[1]) : undefined, month: Number(m[2]), day: Number(m[3]) };
}

/** "March 14" or "March 14, 1990". */
export function formatBirthday(value: string): string {
  const b = parseBirthday(value);
  if (!b) return "";
  return `${monthName(b.month)} ${b.day}${b.year ? `, ${b.year}` : ""}`;
}

export function aboutProblem(a: About): string | null {
  for (const [key, max] of Object.entries(ABOUT_LIMITS) as [keyof typeof ABOUT_LIMITS, number][]) {
    if (a[key].trim().length > max) return `At most ${max} characters.`;
  }
  const b = a.birthday && parseBirthday(a.birthday);
  if (a.birthday && (!b || !birthdayValue(b.month, b.day, b.year))) return "That birthday isn't a real date.";
  return null;
}

function aboutFromData(data: Record<string, unknown> | undefined): About {
  const out = { ...EMPTY_ABOUT };
  for (const key of Object.keys(out) as (keyof About)[]) {
    if (typeof data?.[key] === "string") out[key] = data[key] as string;
  }
  return out;
}

/**
 * The friends-only "about" details, live. Readable only by the owner and
 * their current mutual friends; anyone else gets permission-denied (onError).
 */
export function watchAbout(
  db: Firestore,
  uid: string,
  onAbout: (about: About) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(aboutDoc(db, uid), (snap) => onAbout(aboutFromData(snap.data())), onError);
}

/** Saves all the about details at once; empty ones are left out. */
export async function saveAbout(db: Firestore, uid: string, about: About): Promise<void> {
  const problem = aboutProblem(about);
  if (problem) throw new Error(problem);
  const data: Record<string, string> = { bio: about.bio.trim() };
  for (const key of ["birthday", "hometown", "prayerRequests", "bibleVersion", "denomination", "church"] as const) {
    const v = about[key].trim();
    if (v) data[key] = v;
  }
  await setDoc(aboutDoc(db, uid), data);
}

export async function findByUsername(db: Firestore, input: string): Promise<Profile | null> {
  const username = normalizeUsername(input);
  if (usernameProblem(username)) return null;
  const claim = await getDoc(doc(db, "usernames", username));
  if (!claim.exists()) return null;
  return getProfile(db, claim.data().uid);
}
