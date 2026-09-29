import type { ExpoConfig } from "expo/config";

// STEP 4 PROTOTYPE app: its own bundle id, so it installs next to the real app.
// Needs, from Firebase console > Project settings > add an iOS app with this
// bundle id: GoogleService-Info.plist in this folder (git-ignored).
const bundleId = process.env.PROTO_IOS_BUNDLE_ID || "com.example.prayerapp.pushproto";

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
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    ["expo-build-properties", { ios: { useFrameworks: "static" } }],
  ],
};

export default config;
