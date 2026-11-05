import * as Application from "expo-application";
import { Alert, Linking, Platform } from "react-native";
import { t } from "../i18n";
import { FEEDBACK_EMAIL, feedbackMail } from "./feedback";
import { WEB_URL } from "./webLinks";

/** PrayAlong's privacy policy, on Firebase Hosting (firebase/hosting/privacy/). */
export const PRIVACY_URL = `${WEB_URL}/privacy`;

export function openPrivacyPolicy(): void {
  Linking.openURL(PRIVACY_URL).catch(() => {});
}

/** Settings → Send feedback: opens Mail, or shows the address if there's no mail app. */
export async function sendFeedback(): Promise<void> {
  const url = feedbackMail({
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    system: `${Platform.OS === "ios" ? "iOS" : Platform.OS} ${Platform.Version}`,
  });
  const opened = await Linking.openURL(url).then(() => true, () => false);
  if (!opened) Alert.alert(t("feedback.noMailTitle"), t("feedback.noMailBody", { email: FEEDBACK_EMAIL }));
}
