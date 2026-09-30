import type { ExpoConfig } from "expo/config";

// STEP 4 PROTOTYPE app: its own bundle id, so it installs next to the real app.
// Needs, from Firebase console > Project settings, an app registered with this
// id: google-services.json (Android) and/or GoogleService-Info.plist (iOS)
// in this folder (both git-ignored).
// PROTO_BUNDLE_ID sets both the iOS bundle id and the Android package.
const bundleId = process.env.PROTO_BUNDLE_ID || "com.example.prayerapp.pushproto";

const config: ExpoConfig = {
  name: "Push Proto",
  slug: "prayerapp-push-proto",
  version: "0.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    googleServicesFile: "./GoogleService-Info.plist",
    entitlements: {
      // Remote push (development APNs environment for Xcode builds).
      "aps-environment": "development",
      // Lets the prompt break through Focus if the user allows it.
      "com.apple.developer.usernotifications.time-sensitive": true,
    },
    infoPlist: { UIBackgroundModes: ["remote-notification"] },
  },
  android: {
    package: bundleId,
    googleServicesFile: "./google-services.json",
    // Android 13+: required to show any notification (asked for at runtime in App.tsx).
    permissions: ["android.permission.POST_NOTIFICATIONS"],
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    ["expo-build-properties", { ios: { useFrameworks: "static" } }],
  ],
};

export default config;
