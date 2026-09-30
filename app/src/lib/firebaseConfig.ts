import type { FirebaseOptions } from "firebase/app";

/** The EXPO_PUBLIC_* values from app/.env. Empty strings count as unset. */
export type FirebaseEnv = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  useEmulators?: string;
  emulatorHost?: string;
};

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const EMULATOR_PROJECT_ID = "demo-prayerapp";
// The emulators' default bucket, which the Cloud Functions triggers also use.
export const EMULATOR_BUCKET = "demo-prayerapp.appspot.com";

export function resolveFirebaseConfig(env: FirebaseEnv): {
  options: FirebaseOptions;
  usingEmulators: boolean;
  emulatorHost: string;
} {
  const usingEmulators = clean(env.useEmulators) === "1";
  const emulatorHost = clean(env.emulatorHost) ?? "127.0.0.1";
  if (usingEmulators) {
    // The emulators accept any API key but reject an empty one
    // (auth/invalid-api-key); .env.example leaves the real values empty.
    return {
      usingEmulators,
      emulatorHost,
      options: {
        apiKey: clean(env.apiKey) ?? "demo-api-key",
        projectId: EMULATOR_PROJECT_ID,
        storageBucket: EMULATOR_BUCKET,
        ...(clean(env.appId) ? { appId: clean(env.appId) } : {}),
      },
    };
  }
  const options: FirebaseOptions = {
    apiKey: clean(env.apiKey),
    authDomain: clean(env.authDomain),
    projectId: clean(env.projectId),
    storageBucket: clean(env.storageBucket),
    messagingSenderId: clean(env.messagingSenderId),
    appId: clean(env.appId),
  };
  const missing = (["apiKey", "projectId", "appId", "storageBucket"] as const).filter((k) => !options[k]);
  if (missing.length) {
    throw new FirebaseConfigError(
      `Firebase isn't configured (missing ${missing.join(", ")}). Fill in the EXPO_PUBLIC_FIREBASE_* values in app/.env, ` +
        "or set EXPO_PUBLIC_USE_EMULATORS=1 to use the local emulators. Then restart the app.",
    );
  }
  return { usingEmulators, emulatorHost, options };
}
