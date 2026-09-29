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

export const storageAs = (env: RulesTestEnvironment, uid: string) =>
  env.authenticatedContext(uid, claims).storage() as unknown as FirebaseStorage;

export async function seedUser(env: RulesTestEnvironment, uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "users", uid), { username: uid.toLowerCase(), displayName: uid, createdAt: Timestamp.now() });
    await setDoc(doc(db, "usernames", uid.toLowerCase()), { uid });
  });
}

export async function seedPost(env: RulesTestEnvironment, id: string, authorId: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, "posts", id), {
      authorId,
      notes: "private",
      createdAt: Timestamp.now(),
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
