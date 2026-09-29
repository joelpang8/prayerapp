import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, Timestamp, writeBatch } from "firebase/firestore";

const rulesPath = fileURLToPath(new URL("../firestore.rules", import.meta.url));

export async function setupEnv() {
  return initializeTestEnvironment({
    projectId: "demo-prayerapp",
    firestore: { rules: readFileSync(rulesPath, "utf8") },
  });
}

// Real sign-ins (Apple/Google) carry a sign_in_provider claim; mirror that.
export function signedInAs(env, uid, provider = "apple.com") {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();
}

export function anonymousUser(env, uid) {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
}

export function signedOut(env) {
  return env.unauthenticatedContext().firestore();
}

// Seed data bypassing rules (acts like the Admin SDK / Cloud Functions).
export async function seed(env, fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

export async function seedUser(env, uid, username = uid.toLowerCase()) {
  await seed(env, async (db) => {
    await setDoc(doc(db, "users", uid), { username, displayName: uid, createdAt: Timestamp.now() });
    await setDoc(doc(db, "usernames", username), { uid });
  });
}

export async function seedFollow(env, followerId, followeeId) {
  await seed(env, (db) =>
    setDoc(doc(db, "follows", `${followerId}_${followeeId}`), {
      followerId,
      followeeId,
      createdAt: Timestamp.now(),
    }),
  );
}

export async function seedFriends(env, a, b) {
  await seedFollow(env, a, b);
  await seedFollow(env, b, a);
}

export async function seedPost(env, postId, authorId, extra = {}) {
  await seed(env, (db) =>
    setDoc(doc(db, "posts", postId), {
      authorId,
      notes: `private prayer notes by ${authorId}`,
      createdAt: Timestamp.now(),
      ...extra,
    }),
  );
}

// Client-side follow as the real app will write it.
export function followDoc(db, followerId, followeeId) {
  return setDoc(doc(db, "follows", `${followerId}_${followeeId}`), {
    followerId,
    followeeId,
    createdAt: serverTimestamp(),
  });
}

// Client-side sign-up as the real app will write it.
export function createProfileBatch(db, uid, username, displayName = "Someone") {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), { username, displayName, createdAt: serverTimestamp() });
  batch.set(doc(db, "usernames", username), { uid });
  return batch.commit();
}
