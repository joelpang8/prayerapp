import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";

/**
 * Prompt notifications ("Time to pray").
 *
 * In development they come from `npm run dev:prompt`, which drops one into
 * the iOS Simulator. Real pushes to phones are step 4's integration, still to
 * come: they need the paid Apple account (REMOTE_PUSH=1, see app.config.ts).
 * Whatever sends them, the app's part is the same: permission, showing the
 * alert, and opening Today when it's tapped.
 */

export type NotificationStatus = "granted" | "denied" | "undetermined";

/** Android channel for prompts: high importance so the alert pops up. */
export const PROMPT_CHANNEL = "prompt";

/** iOS "provisional" (quiet delivery) counts as on: the alert still arrives. */
export function statusFrom(p: Pick<Notifications.NotificationPermissionsStatus, "granted" | "canAskAgain" | "ios">): NotificationStatus {
  if (p.granted) return "granted";
  const ios = p.ios?.status;
  if (ios === Notifications.IosAuthorizationStatus.PROVISIONAL || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) return "granted";
  if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return "undetermined";
  return p.canAskAgain ? "undetermined" : "denied";
}

let configured = false;

/** Call once at startup. Shows prompts even while the app is open. */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(PROMPT_CHANNEL, {
      name: "Prayer prompts",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch((err) => console.warn("notification channel failed", err));
  }
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return statusFrom(await Notifications.getPermissionsAsync());
}

export async function requestNotifications(): Promise<NotificationStatus> {
  return statusFrom(await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  }));
}

/** Once denied, only the phone's Settings app can turn them back on. */
export const openPhoneSettings = () => Linking.openSettings();

/**
 * The current permission, re-checked whenever the app comes back to the
 * foreground (the user may have changed it in the phone's Settings).
 * `status` is null until the first check finishes.
 */
export function useNotificationPermission(): { status: NotificationStatus | null; request: () => Promise<void> } {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const refresh = useCallback(() => {
    getNotificationStatus().then(setStatus, () => setStatus("undetermined"));
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);
  const request = useCallback(async () => {
    setStatus(await requestNotifications().catch(() => "undetermined" as const));
  }, []);
  return { status, request };
}

/**
 * Calls `onOpen` when the user taps a notification, including the one that
 * launched the app. Every notification this app sends is a prompt.
 */
export function useNotificationTaps(onOpen: () => void): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    onOpen();
    // Handled: don't act on the same tap again after a reload.
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [response, onOpen]);
}
