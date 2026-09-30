import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  type UserCredential,
} from "firebase/auth";
import { auth, usingEmulators } from "../firebase";

// Only set up Google Sign-In once it's configured (app/.env). Configuring
// without a client id makes the native module reject, which shows up as an
// "unhandled promise rejection" warning at startup (e.g. in emulator mode).
const googleConfigured = !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
if (googleConfigured) {
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

export type SignInResult = { credential: UserCredential; suggestedName: string | null } | null;

/**
 * Sign in with Apple. Firebase requires a nonce: Apple receives its SHA-256
 * hash, Firebase receives the raw value, which proves the token was issued
 * for this sign-in attempt. Returns null if the user cancelled.
 */
export async function signInWithApple(): Promise<SignInResult> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let apple: AppleAuthentication.AppleAuthenticationCredential;
  try {
    apple = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw err;
  }
  if (!apple.identityToken) throw new Error("Apple did not return an identity token.");
  const credential = await signInWithCredential(
    auth,
    new OAuthProvider("apple.com").credential({ idToken: apple.identityToken, rawNonce }),
  );
  // Apple only shares the name on the very first sign-in.
  const name = [apple.fullName?.givenName, apple.fullName?.familyName].filter(Boolean).join(" ");
  return { credential, suggestedName: name || null };
}

export async function signInWithGoogle(): Promise<SignInResult> {
  if (!googleConfigured) throw new Error("Google Sign-In isn't configured. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in app/.env.");
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  const { idToken, user } = response.data;
  if (!idToken) throw new Error("Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.");
  const credential = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  return { credential, suggestedName: user.name };
}

/**
 * Emulator only: the Auth emulator accepts an unsigned fake Google token,
 * so the whole app can be exercised in the simulator without real OAuth.
 * Signs in with provider "google.com", same as a real Google sign-in.
 */
export async function signInForDevelopment(name: string): Promise<SignInResult> {
  if (!usingEmulators) throw new Error("Development sign-in only works against the emulators.");
  const sub = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "tester";
  const fakeToken = JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name });
  const credential = await signInWithCredential(auth, GoogleAuthProvider.credential(fakeToken));
  return { credential, suggestedName: name };
}

export async function signOut(): Promise<void> {
  try {
    if (googleConfigured && GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
  } finally {
    await firebaseSignOut(auth);
  }
}
