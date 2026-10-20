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

// Real (remote) push to iPhones needs the paid Apple Developer Program and
// an APNs key, and its entitlement (aps-environment) also makes Xcode require
// a signing certificate for Simulator builds. Off until REMOTE_PUSH=1 is set
// in app/.env. Showing notifications and asking permission work without it,
// which is all the Simulator and `npm run dev:prompt` need.
const remotePush = process.env.REMOTE_PUSH === "1";

// Push builds link React Native Firebase (messaging), which reads the iOS
// app's GoogleService-Info.plist (Firebase console > Your apps > iOS app for
// this bundle id). Git-ignored; only needed when REMOTE_PUSH=1.
const googleServicesFile = process.env.GOOGLE_SERVICES_PLIST || "./GoogleService-Info.plist";

// Your paid Apple Developer team (app/.env.device, used by `npm run ios:device`).
// Set: Xcode signs with that team. Unset: the free Personal Team, as before.
const appleTeamId = process.env.APPLE_TEAM_ID || undefined;

// Expo applies expo-apple-authentication's and expo-notifications' plugins
// automatically whenever the packages are installed, and they always add their
// entitlements. Remove them again while those features are off.
const withoutPaidAccountEntitlements: ConfigPlugin = (c) =>
  withEntitlementsPlist(c, (mod) => {
    if (!appleSignIn) delete mod.modResults["com.apple.developer.applesignin"];
    if (!remotePush) delete mod.modResults["aps-environment"];
    return mod;
  });

// Spanish system texts (permission prompts) and iOS's list of languages.
// Off until the Spanish wording has been reviewed by a native speaker: must
// match SPANISH_REVIEWED in src/i18n/index.ts (a test checks).
const spanishReviewed = false;

const config: ExpoConfig = {
  name: "PrayAlong",
  slug: "prayerapp",
  scheme: "prayerapp",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  ...(spanishReviewed ? { locales: { es: "./locales/es.json" } } : {}),
  // "automatic" lets night mode follow the phone; the in-app setting can override it.
  userInterfaceStyle: "automatic",
  ios: {
    // Home-screen icon styles (iOS 18+): the candle on its own for Dark, and
    // in grays for Tinted (the phone adds the tint).
    icon: { light: "./assets/icon.png", dark: "./assets/icon-dark.png", tinted: "./assets/icon-tinted.png" },
    bundleIdentifier: bundleId,
    ...(appleTeamId ? { appleTeamId } : {}),
    supportsTablet: false,
    // Only standard HTTPS (exempt), so App Store Connect doesn't ask about
    // export compliance on every TestFlight build.
    config: { usesNonExemptEncryption: false },
    usesAppleSignIn: appleSignIn,
    infoPlist: {
      // Ask iOS for approximate location by default: only a town name is shown.
      NSLocationDefaultAccuracyReduced: true,
      // Push builds: as proven in the step 4 prototype.
      ...(remotePush ? { UIBackgroundModes: ["remote-notification"] } : {}),
    },
    ...(remotePush
      ? {
          googleServicesFile,
          // Lets "Time to pray" break through Focus if the user allows it.
          entitlements: { "com.apple.developer.usernotifications.time-sensitive": true },
        }
      : {}),
  },
  // Read by app/src/lib/push.ts: whether this build has push linked in.
  extra: { remotePush },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: "#3A2F5E",
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
    ["expo-localization", { supportedLocales: { ios: spanishReviewed ? ["en", "es"] : ["en"] } }],
    // The lock-screen countdown (a Live Activity) while the prompt is open.
    // Started on the phone only: no push-to-start or update tokens (the
    // plugin's enablePushNotifications stays off). Its candle image is
    // assets/liveActivity/candle.png (iOS allows at most 4 KB).
    // Before expo-live-activity: signs its widget extension with the same team.
    "./plugins/withTeamForAllTargets",
    "expo-live-activity",
    // Launch screen: the candle and "PrayAlong" on the app's own background,
    // light or dark with the phone. It stays up until the first screen is
    // ready, then fades (app/src/app/_layout.tsx).
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-light.png",
        backgroundColor: "#FAF8F5",
        imageWidth: 200,
        dark: { image: "./assets/splash-dark.png", backgroundColor: "#15130F" },
      },
    ],
    // Only used to let "Listen" play with the silent switch on. No recording
    // and no background audio, so no microphone permission or audio
    // background mode (the plugin adds both by default).
    [
      "expo-audio",
      { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false },
    ],
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
        // Never asked for: the app doesn't use motion data. App Store Connect
        // still requires the text because expo-location's code references the
        // motion API (ITMS-90683), so say so plainly.
        motionUsagePermission: "PrayAlong doesn't use motion or fitness data and never asks for it.",
      },
    ],
    // Prompt notifications. No custom sounds or background modes: a prompt is
    // a plain alert, and the app reads the prompt itself from Firestore.
    ["expo-notifications", { enableBackgroundRemoteNotifications: false }],
    // The daily "Time to pray" push (FCM topic), in push builds only; the same
    // setup that was proven on an iPhone in the step 4 prototype. Its native
    // code is only linked when REMOTE_PUSH=1 (react-native.config.js).
    ...(remotePush
      ? [
          "@react-native-firebase/app",
          "@react-native-firebase/messaging",
          "./plugins/withRNFirebaseNoSPM",
        ]
      : []),
    // Build Expo's modules from source with this Mac's Xcode instead of
    // using Expo's precompiled ones: those only work with the exact Swift
    // version they were built with, and broke when Xcode updated (Swift 6.4
    // vs 6.3.1: "this SDK is not supported by the compiler"). Push builds
    // also need static frameworks for React Native Firebase.
    [
      "expo-build-properties",
      { ios: { usePrecompiledModules: false, ...(remotePush ? { useFrameworks: "static" } : {}) } },
    ] as [string, object],
    // Google Sign-In needs the reversed iOS client id as a URL scheme. It's
    // left out until configured, so emulator-only development still builds.
    ...(googleUrlScheme
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleUrlScheme }] as [string, object]]
      : []),
  ],
};

export default appleSignIn && remotePush ? config : withoutPaidAccountEntitlements(config);
