import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { firestoreSettings } from "./lib/firestoreSettings";

// Firebase web config is not secret; access is controlled by the rules.
// Values come from app/.env (see .env.example).
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const usingEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === "1";
// On a physical phone this must be your Mac's LAN IP, not localhost.
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";

type Services = { auth: Auth; db: Firestore; storage: FirebaseStorage };

function init(): Services {
  if (getApps().length) {
    // Fast refresh: reuse the instances created on first load.
    return (globalThis as unknown as { __prayerFirebase: Services }).__prayerFirebase;
  }
  const app = initializeApp(
    usingEmulators ? { ...config, projectId: "demo-prayerapp", apiKey: config.apiKey ?? "demo" } : config,
  );
  // Auth session (not content) is persisted so the user stays signed in.
  const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  const db = initializeFirestore(app, firestoreSettings);
  const storage = getStorage(app);
  if (usingEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    connectStorageEmulator(storage, emulatorHost, 9199);
  }
  const services = { auth, db, storage };
  (globalThis as unknown as { __prayerFirebase: Services }).__prayerFirebase = services;
  return services;
}

export const { auth, db, storage } = init();
