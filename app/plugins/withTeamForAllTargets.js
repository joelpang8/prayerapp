const { withXcodeProject } = require("expo/config-plugins");

/**
 * Sets the Apple team on every target, not just the app. Expo sets it only
 * on the app target (ios.appleTeamId); the Live Activity widget extension
 * added by expo-live-activity would otherwise fail to sign ("requires a
 * development team"). Listed before expo-live-activity in app.config.ts:
 * mods run in reverse order, so this runs after the extension is added.
 */
module.exports = function withTeamForAllTargets(config) {
  const team = config.ios?.appleTeamId;
  if (!team) return config;
  return withXcodeProject(config, (mod) => {
    const configs = mod.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configs)) {
      const settings = entry && typeof entry === "object" ? entry.buildSettings : undefined;
      if (settings && settings.PRODUCT_BUNDLE_IDENTIFIER) settings.DEVELOPMENT_TEAM = team;
    }
    return mod;
  });
};
