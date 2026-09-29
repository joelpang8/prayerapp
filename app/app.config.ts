import type { ExpoConfig } from "expo/config";

// Values come from app/.env (copy .env.example). Expo loads .env automatically.
const bundleId = process.env.IOS_BUNDLE_ID || "com.example.prayerapp";
const googleUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

const config: ExpoConfig = {
  name: "Pray Now",
  slug: "prayerapp",
  scheme: "prayerapp",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    usesAppleSignIn: true,
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "expo-image",
    // Google Sign-In needs the reversed iOS client id as a URL scheme. It's
    // left out until configured, so emulator-only development still builds.
    ...(googleUrlScheme
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleUrlScheme }] as [string, object]]
      : []),
  ],
};

export default config;
