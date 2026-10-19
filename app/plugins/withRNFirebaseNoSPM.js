// React Native Firebase 26 resolves the Firebase iOS SDK through Swift Package
// Manager by default, which can't be combined with the static frameworks this
// app needs (`useFrameworks: "static"`): `pod install` refuses with "SPM +
// static linkage is not supported". Setting $RNFirebaseDisableSPM makes it use
// CocoaPods for Firebase instead, as RNFirebase's own message recommends.
const { withPodfile } = require("expo/config-plugins");

const LINE = "$RNFirebaseDisableSPM = true";

module.exports = function withRNFirebaseNoSPM(config) {
  return withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes(LINE)) {
      mod.modResults.contents = `${LINE}\n${mod.modResults.contents}`;
    }
    return mod;
  });
};
