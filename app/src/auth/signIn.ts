import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  revokeAccessToken,
  signInWithCredential,
  signOut as firebaseSignOut,
  type UserCredential,
} from "firebase/auth";
import { auth, usingEmulators } from "../firebase";
import { REMINDER_ID } from "../lib/reminder";
import { setActivitySubscription } from "../lib/push";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

/**
 * Signs the current person in again with the same provider, as required
 * right before deleting the account. For Apple it also returns the
 * authorization code, which deleteAccount needs to revoke Apple's token.
 * Returns null if they cancelled.
 */
export async function reauthenticate(): Promise<{ appleAuthorizationCode: string | null } | null> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const provider = user.providerData[0]?.providerId;
  if (provider === "apple.com") {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let apple: AppleAuthentication.AppleAuthenticationCredential;
    try {
      apple = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashedNonce });
    } catch (err) {
      if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
      throw err;
    }
    if (!apple.identityToken) throw new Error("Apple did not return an identity token.");
    await reauthenticateWithCredential(user, new OAuthProvider("apple.com").credential({ idToken: apple.identityToken, rawNonce }));
    return { appleAuthorizationCode: apple.authorizationCode ?? null };
  }
  if (usingEmulators) {
    // Development sign-in: the same fake Google token it signed in with.
    const sub = (user.email ?? "tester@example.com").split("@")[0];
    const fakeToken = JSON.stringify({ sub, email: user.email, email_verified: true, name: user.displayName ?? sub });
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(fakeToken));
    return { appleAuthorizationCode: null };
  }
  if (!googleConfigured) throw new Error("Google Sign-In isn't configured.");
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.idToken) throw new Error("Google did not return an ID token.");
  await reauthenticateWithCredential(user, GoogleAuthProvider.credential(response.data.idToken));
  return { appleAuthorizationCode: null };
}

/**
 * Apple requires apps to revoke its tokens when an account is deleted.
 * Needs Apple's OAuth code-flow settings in the Firebase console
 * (Authentication > Apple: Services ID, team, key); see docs.
 */
export async function revokeAppleToken(authorizationCode: string): Promise<void> {
  await revokeAccessToken(auth, authorizationCode);
}

export async function signOut(): Promise<void> {
  // A reminder scheduled for this account shouldn't fire after signing out.
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  // Stop listening for this account's opt-in notifications on this phone.
  const uid = auth.currentUser?.uid;
  if (uid) {
    const topic = await AsyncStorage.getItem(`activityTopic.${uid}`).catch(() => null);
    if (topic) await setActivitySubscription(topic, false).catch(() => {});
  }
  try {
    if (googleConfigured && GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
  } finally {
    await firebaseSignOut(auth);
  }
}
