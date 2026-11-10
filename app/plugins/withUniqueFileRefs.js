const { withXcodeProject } = require("expo/config-plugins");

/**
 * expo-live-activity and expo-widgets each add a widget extension with its
 * own Info.plist, but the second one reuses the first one's file reference,
 * so one "Info.plist" sits in two groups and Xcode refuses to open the
 * project ("is a member of more than one group"). This gives every group
 * after the first its own copy of any shared file reference. Listed before
 * both plugins in app.config.ts: mods run in reverse order, so this runs
 * after they've added their files.
 */
module.exports = function withUniqueFileRefs(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const objects = project.hash.project.objects;
    const groups = objects.PBXGroup ?? {};
    const refs = objects.PBXFileReference ?? {};
    const seen = new Set();
    for (const [id, group] of Object.entries(groups)) {
      if (id.endsWith("_comment") || !group || !Array.isArray(group.children)) continue;
      group.children = group.children.map((child) => {
        if (!refs[child.value]) return child; // a sub-group, not a file
        if (!seen.has(child.value)) {
          seen.add(child.value);
          return child;
        }
        const copyId = project.generateUuid();
        refs[copyId] = { ...refs[child.value] };
        refs[`${copyId}_comment`] = refs[`${child.value}_comment`] ?? child.comment;
        seen.add(copyId);
        return { value: copyId, comment: child.comment };
      });
    }
    return mod;
  });
};
