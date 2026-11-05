const fs = require("fs");
const path = require("path");
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const FILE = "PrayerListShortcut.swift";

/**
 * Adds the Siri / Shortcuts action "Add to My Prayer List"
 * (plugins/ios/PrayerListShortcut.swift) to the app target. It opens the app
 * on the Add screen with the name filled in; no entitlement needed.
 */
module.exports = function withPrayerListShortcut(config) {
  config = withDangerousMod(config, ["ios", (mod) => {
    const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const dest = path.join(mod.modRequest.platformProjectRoot, name, FILE);
    fs.copyFileSync(path.join(__dirname, "ios", FILE), dest);
    return mod;
  }]);
  return withXcodeProject(config, (mod) => {
    const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const filepath = `${name}/${FILE}`;
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: mod.modResults });
    }
    return mod;
  });
};
