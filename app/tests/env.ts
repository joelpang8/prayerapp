import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

export const PROJECT_ID = "demo-prayerapp";

const rules = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../firebase/${name}`, import.meta.url)), "utf8");

export function setupEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rules("firestore.rules") },
    storage: { rules: rules("storage.rules") },
  });
}

const claims = { firebase: { sign_in_provider: "apple.com" as const } };

// rules-unit-testing returns compat instances; the modular API accepts them.
export const dbAs = (env: RulesTestEnvironment, uid: string) =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

// The project's default bucket (what Cloud Functions triggers listen on).
export const BUCKET = "gs://demo-prayerapp.appspot.com";

export const storageAs = (env: RulesTestEnvironment, uid: string) =>
  env.authenticatedContext(uid, claims).storage(BUCKET) as unknown as FirebaseStorage;

/** Recursive clear: env.clearStorage() only removes top-level objects. */
export async function clearBucket(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    type Ref = { listAll(): Promise<{ items: { delete(): Promise<void> }[]; prefixes: Ref[] }> };
    const walk = async (ref: Ref): Promise<void> => {
      const { items, prefixes } = await ref.listAll();
      await Promise.all([...items.map((i) => i.delete()), ...prefixes.map(walk)]);
    };
    await walk(ctx.storage(BUCKET).ref() as unknown as Ref);
  });
}

export async function seedPrompt(env: RulesTestEnvironment, id: string, minutesAgo = 1, verseRef?: string): Promise<Date> {
  const firedAt = new Date(Date.now() - minutesAgo * 60_000);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, "prompts", id), {
      firedAt: Timestamp.fromDate(firedAt),
      ...(verseRef ? { verseRef } : {}),
    });
  });
  return firedAt;
}

export async function seedUser(env: RulesTestEnvironment, uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "users", uid), { username: uid.toLowerCase(), displayName: uid, createdAt: Timestamp.now() });
    await setDoc(doc(db, "usernames", uid.toLowerCase()), { uid });
  });
}

export async function seedPost(env: RulesTestEnvironment, id: string, authorId: string, createdAt = new Date()) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, "posts", id), {
      authorId,
      promptId: "20260929",
      promptFiredAt: Timestamp.fromDate(createdAt),
      notes: `private notes by ${authorId}`,
      photoPath: `postPhotos/${authorId}/p1.jpg`,
      createdAt: Timestamp.fromDate(createdAt),
      visibility: "friends",
    });
  });
}

/** Wait until `check` returns true, polling every 50ms. */
export async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Cross-service rules (storage.rules calling firestore.exists) are broken in
// the Firebase Storage emulator when HTTPS_PROXY is set: firebase-tools routes
// the emulator's own localhost call through the proxy. CI and local Macs are
// unaffected; set SKIP_CROSS_SERVICE=1 only in proxied sandboxes.
export const skipCrossService = process.env.SKIP_CROSS_SERVICE === "1";
