import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

export type Profile = {
  uid: string;
  username: string;
  displayName: string;
};

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
  const data = snap.data();
  return { uid, username: data.username, displayName: data.displayName };
}

export async function findByUsername(db: Firestore, input: string): Promise<Profile | null> {
  const username = normalizeUsername(input);
  if (usernameProblem(username)) return null;
  const claim = await getDoc(doc(db, "usernames", username));
  if (!claim.exists()) return null;
  return getProfile(db, claim.data().uid);
}
