import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { currentLang } from "../i18n";
import { useNotificationPermission } from "../lib/notifications";
import { anyOn, changeNotifyPrefs, newTopic, saveNotifyPrefs, watchNotifyPrefs, type NotifyKind, type NotifyPrefs } from "../lib/notifyPrefs";
import { pushAvailable, setActivitySubscription } from "../lib/push";
import { useReadySession } from "./SessionProvider";

/** Where this phone remembers which secret topic it listens on (removed with the account's keys). */
export const activityTopicKey = (uid: string) => `activityTopic.${uid}`;

/** My opt-in notification settings, live, and a way to change one. */
export function useNotifyPrefs(): { prefs: NotifyPrefs | null; loaded: boolean; set: (kind: NotifyKind, on: boolean) => Promise<void> } {
  const { profile } = useReadySession();
  const [state, setState] = useState<{ prefs: NotifyPrefs | null; loaded: boolean }>({ prefs: null, loaded: false });
  useEffect(() => watchNotifyPrefs(db, profile.uid, (prefs) => setState({ prefs, loaded: true })), [profile.uid]);
  return {
    ...state,
    set: (kind, on) =>
      saveNotifyPrefs(db, profile.uid, changeNotifyPrefs(state.prefs, kind, on, currentLang(), () => newTopic(Crypto.getRandomBytes))),
  };
}

/**
 * This phone listens on my secret topic only while at least one kind is on
 * and notifications are allowed; otherwise it stops. Push builds only.
 */
export function useActivitySubscription(): void {
  const { profile } = useReadySession();
  const { prefs, loaded } = useNotifyPrefs();
  const permission = useNotificationPermission();
  const wanted = loaded && anyOn(prefs) && permission.status === "granted";
  const topic = prefs?.topic ?? null;
  useEffect(() => {
    if (!pushAvailable() || !loaded || permission.status === null) return;
    const key = activityTopicKey(profile.uid);
    (async () => {
      const previous = await AsyncStorage.getItem(key).catch(() => null);
      if (previous && (previous !== topic || !wanted)) {
        await setActivitySubscription(previous, false);
        await AsyncStorage.removeItem(key).catch(() => {});
      }
      if (wanted && topic) {
        await setActivitySubscription(topic, true);
        await AsyncStorage.setItem(key, topic).catch(() => {});
      }
    })().catch((err) => console.warn("activity subscription failed", err));
  }, [profile.uid, topic, wanted, loaded, permission.status]);
}
