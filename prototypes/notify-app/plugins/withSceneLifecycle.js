// Adopts the UIScene life cycle, which apps built with the iOS 27 SDK must use:
// without it the app fails at launch with "UIScene life cycle is required for
// apps built with this SDK".
//
// Expo SDK 57 ships the scene delegate (ExpoAppSceneDelegate, Objective-C name
// EXExpoAppSceneDelegate) but its default template still uses the old
// window-in-AppDelegate setup. This plugin, run on every prebuild:
//  - makes AppDelegate an ExpoReactNativeFactoryProvider and stops it creating
//    the window itself (the scene delegate creates it and starts React Native);
//  - declares the scene delegate in Info.plist.
// Remove it once Expo's template does this itself.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// Only these two statements move to the scene delegate. Anything else other
// plugins put in the same block (e.g. React Native Firebase's
// FirebaseApp.configure()) must stay, so they're removed individually.
const CREATE_WINDOW = /\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n/;
const START_REACT_NATIVE = /\n[ \t]*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\n/;

function patchAppDelegate(src) {
  if (src.includes("ExpoReactNativeFactoryProvider")) return src; // already patched
  const withProtocol = src.replace(
    "class AppDelegate: ExpoAppDelegate {",
    "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
  );
  const withoutWindow = withProtocol.replace(
    CREATE_WINDOW,
    "\n    // The scene delegate (EXExpoAppSceneDelegate) creates the window and starts\n    // React Native; see plugins/withSceneLifecycle.js.\n",
  );
  const withoutStart = withoutWindow.replace(START_REACT_NATIVE, "\n");
  if (withProtocol === src || withoutWindow === withProtocol || withoutStart === withoutWindow) {
    throw new Error(
      "withSceneLifecycle: AppDelegate.swift doesn't match the expected Expo template; update the plugin.",
    );
  }
  return withoutStart;
}

// Keep this plugin FIRST in app.config.ts: Expo runs AppDelegate mods in
// reverse order, so listing it first makes it run after other plugins (like
// React Native Firebase) have inserted their code.
module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") throw new Error("withSceneLifecycle expects a Swift AppDelegate");
    mod.modResults.contents = patchAppDelegate(mod.modResults.contents);
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
};

module.exports.patchAppDelegate = patchAppDelegate;
