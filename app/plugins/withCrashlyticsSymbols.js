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
    const target = project.getFirstTarget();
    const { buildPhase } = project.addBuildPhase([], "PBXShellScriptBuildPhase", NAME, target.uuid, {
      shellPath: "/bin/sh",
      shellScript: '"${PODS_ROOT}/FirebaseCrashlytics/run"',
      // Only the dSYM as input: declaring the app binary or its Info.plist
      // made a dependency cycle with "Embed Foundation Extensions" (the
      // widget and Live Activity) and the archive failed ("Cycle inside
      // PrayAlong"). No outputs, so it runs on every build, which is fine.
      inputPaths: ['"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"'],
    });
    buildPhase.alwaysOutOfDate = 1;
    // Last of the app's build phases, after the extensions are embedded.
    const order = target.firstTarget.buildPhases;
    const i = order.findIndex((p) => String(p.comment).includes(NAME));
    if (i >= 0) order.push(...order.splice(i, 1));
    return mod;
  });
};
