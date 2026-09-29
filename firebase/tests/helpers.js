import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, Timestamp, writeBatch } from "firebase/firestore";

const rulesFile = (name) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");

export async function setupEnv() {
  return initializeTestEnvironment({
    projectId: "demo-prayerapp",
    firestore: { rules: rulesFile("firestore.rules") },
    storage: { rules: rulesFile("storage.rules") },
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

// The project's default bucket, which is also what Cloud Functions triggers
// listen on. (rules-unit-testing would otherwise default to gs://{projectId}.)
export const BUCKET = "gs://demo-prayerapp.appspot.com";

export function storageAs(env, uid, provider = "apple.com") {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).storage(BUCKET);
}

export function anonymousStorage(env, uid) {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).storage(BUCKET);
}

export function signedOutStorage(env) {
  return env.unauthenticatedContext().storage(BUCKET);
}

export function adminStorage(ctx) {
  return ctx.storage(BUCKET);
}

// env.clearStorage() only deletes top-level objects in gs://{projectId};
// post photos are nested, so clear the real bucket recursively.
export async function clearBucket(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const walk = async (ref) => {
      const { items, prefixes } = await ref.listAll();
      await Promise.all([...items.map((i) => i.delete()), ...prefixes.map(walk)]);
    };
    await walk(adminStorage(ctx).ref());
  });
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

// Prompt that fired `minutesAgo` minutes ago (server-written in production).
export async function seedPrompt(env, promptId, minutesAgo = 1) {
  await seed(env, (db) =>
    setDoc(doc(db, "prompts", promptId), {
      firedAt: Timestamp.fromMillis(Date.now() - minutesAgo * 60_000),
    }),
  );
}
