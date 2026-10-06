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
  // "automatic" lets night mode follow the phone; the in-app setting can override it.
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    usesAppleSignIn: appleSignIn,
    infoPlist: {
      // Ask iOS for approximate location by default: only a town name is shown.
      NSLocationDefaultAccuracyReduced: true,
    },
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
    // Only a town name is ever shown, so approximate location is enough.
    blockedPermissions: ["android.permission.ACCESS_FINE_LOCATION"],
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    // iOS 27 SDK: required, or the app fails at launch.
    "./plugins/withSceneLifecycle",
    "expo-router",
    ...(appleSignIn ? ["expo-apple-authentication"] : []),
    "expo-image",
    [
      "expo-image-picker",
      {
        cameraPermission: "Take a photo to go with your prayer, or for your profile picture.",
        // Real users choose from the library only for their profile picture;
        // posts are camera-only (the post picker is development-only).
        photosPermission: "Choose a profile picture.",
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        // Asked only when someone turns on "Show where I prayed" for a post.
        locationWhenInUsePermission: "Show your friends the town or city where you prayed, if you choose to for a post. Your exact location is never shared.",
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        motionUsagePermission: false,
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
