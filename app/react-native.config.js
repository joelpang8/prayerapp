// React Native Firebase (push) is only linked into builds with remote push
// on (REMOTE_PUSH=1, set by `npm run ios:device` / `ios:testflight` from
// app/.env.device). Other builds (the Simulator against the emulators) leave
// its native code out, so they don't need a GoogleService-Info.plist.
// app/src/lib/push.ts only loads it when the build says push is on.
const remotePush = process.env.REMOTE_PUSH === "1";
const off = { platforms: { ios: null, android: null } };

module.exports = {
  dependencies: remotePush
    ? {}
    : {
        "@react-native-firebase/app": off,
        "@react-native-firebase/messaging": off,
      },
};
