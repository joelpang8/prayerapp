import Constants from "expo-constants";
import { useEffect } from "react";

/**
 * The daily "Time to pray" push: one FCM topic every phone subscribes to, so
 * the server sends one message and stores no per-user push token. Only in
 * builds with remote push (REMOTE_PUSH=1, app.config.ts); elsewhere React
 * Native Firebase's native code isn't linked, so it's never loaded.
 *
 * Showing the alert, the permission prompt and opening Today on a tap are
 * handled by notifications.ts as before; this only (un)subscribes the phone
 * and reports taps on pushes that React Native Firebase sees first.
 */
export const PROMPT_TOPIC = "prompt"; // must match firebase/functions/src/dailyPrompt.ts

export const pushAvailable = (): boolean => Constants.expoConfig?.extra?.remotePush === true;

type Messaging = typeof import("@react-native-firebase/messaging");

let loaded: { m: Messaging; instance: ReturnType<Messaging["getMessaging"]> } | null | undefined;

/** React Native Firebase messaging, loaded on first use; null when this build has no push. */
function messaging() {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (!pushAvailable()) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@react-native-firebase/messaging") as Messaging;
    loaded = { m, instance: m.getMessaging() };
  } catch (err) {
    console.warn("push unavailable", err);
  }
  return loaded;
}

/** Subscribe or unsubscribe this phone. Safe to call repeatedly. */
export async function setPromptSubscription(on: boolean): Promise<void> {
  const fm = messaging();
  if (!fm) return;
  if (on) await fm.m.subscribeToTopic(fm.instance, PROMPT_TOPIC);
  else await fm.m.unsubscribeFromTopic(fm.instance, PROMPT_TOPIC);
}

/** Listen (or stop listening) on this account's secret topic for opt-in notifications. */
export async function setActivitySubscription(topic: string, on: boolean): Promise<void> {
  const fm = messaging();
  if (!fm) return;
  if (on) await fm.m.subscribeToTopic(fm.instance, topic);
  else await fm.m.unsubscribeFromTopic(fm.instance, topic);
}

/**
 * Keeps the subscription in step with the app's notifications switch and
 * the phone's permission: subscribed only while both are on.
 */
export function usePromptSubscription(wanted: boolean | null): void {
  useEffect(() => {
    if (wanted === null) return; // permission not checked yet
    setPromptSubscription(wanted).catch((err) => console.warn("push subscription failed", err));
  }, [wanted]);
}

/**
 * Calls `onOpen` when a prompt push is tapped (including the one that
 * launched the app). Complements notifications.ts, in case React Native
 * Firebase receives the tap instead of expo-notifications.
 */
export function usePushTaps(onOpen: (data?: Record<string, unknown>) => void): void {
  useEffect(() => {
    const fm = messaging();
    if (!fm) return;
    fm.m.getInitialNotification(fm.instance).then((msg) => { if (msg) onOpen(msg.data); }, () => {});
    return fm.m.onNotificationOpenedApp(fm.instance, (msg) => onOpen(msg.data));
  }, [onOpen]);
}
