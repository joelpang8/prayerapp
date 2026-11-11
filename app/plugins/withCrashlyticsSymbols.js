const { withXcodeProject } = require("expo/config-plugins");

const NAME = "[PrayAlong] Upload symbols to Crashlytics";

/**
 * Adds Crashlytics' "upload dSYM" run script to the app target, so native
 * crash reports show readable function names. (@react-native-firebase's
 * plugin doesn't add it on iOS.) Push builds only, like Crashlytics itself.
 */
module.exports = function withCrashlyticsSymbols(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    if (Object.values(phases).some((p) => p && typeof p === "object" && String(p.name).includes(NAME))) return mod;
    const target = project.getFirstTarget().uuid;
    project.addBuildPhase([], "PBXShellScriptBuildPhase", NAME, target, {
      shellPath: "/bin/sh",
      shellScript: '"${PODS_ROOT}/FirebaseCrashlytics/run"',
      inputPaths: [
        '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"',
        '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${PRODUCT_NAME}"',
        '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Info.plist"',
        '"$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist"',
        '"$(TARGET_BUILD_DIR)/$(EXECUTABLE_PATH)"',
      ],
    });
    return mod;
  });
};
