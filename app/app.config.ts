import type { ExpoConfig } from "expo/config";
import { withEntitlementsPlist, type ConfigPlugin } from "expo/config-plugins";

// Values come from app/.env (copy .env.example). Expo loads .env automatically.
const bundleId = process.env.IOS_BUNDLE_ID || "com.example.prayerapp";
const googleUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
// Sign in with Apple needs the paid Apple Developer Program: its entitlement
// makes Xcode require a signing certificate even for Simulator builds. Off
// until EXPO_PUBLIC_APPLE_SIGN_IN=1 is set in app/.env (the app hides the
// Apple button too). Changing it needs a rebuild: npx expo prebuild --clean.
const appleSignIn = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === "1";

// Expo applies expo-apple-authentication's plugin automatically whenever the
// package is installed, and that plugin always adds the entitlement. Remove it
// again while Apple sign-in is off.
const withoutAppleSignInEntitlement: ConfigPlugin = (c) =>
  withEntitlementsPlist(c, (mod) => {
    delete mod.modResults["com.apple.developer.applesignin"];
    return mod;
  });

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
    usesAppleSignIn: appleSignIn,
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
    ...(appleSignIn ? ["expo-apple-authentication"] : []),
    "expo-image",
    [
      "expo-image-picker",
      {
        cameraPermission: "Take a photo to go with your prayer. Only your friends can see it.",
        // Library access is only used by the development-only photo picker.
        photosPermission: "Choose a photo to go with your prayer.",
        microphonePermission: false,
      },
    ],
    // Google Sign-In needs the reversed iOS client id as a URL scheme. It's
    // left out until configured, so emulator-only development still builds.
    ...(googleUrlScheme
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleUrlScheme }] as [string, object]]
      : []),
  ],
};

export default appleSignIn ? config : withoutAppleSignInEntitlement(config);
