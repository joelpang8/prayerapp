import { Linking } from "react-native";

/** PrayAlong's privacy policy, on Firebase Hosting (firebase/hosting/privacy/). */
export const PRIVACY_URL = "https://prayerapp-4ce99.web.app/privacy";

export function openPrivacyPolicy(): void {
  Linking.openURL(PRIVACY_URL).catch(() => {});
}
