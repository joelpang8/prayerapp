// CI: generates the iPhone project the way `npm run ios:device` does (paid
// team, push on, so the widget, Live Activity and Firebase plugins all run)
// and checks it's one Xcode will open, without needing a Mac:
//  - no file is a member of two groups (Xcode refuses to open the project),
//  - the app, widget and Live Activity targets are all there,
//  - Crashlytics' dSYM upload step is in place.
// Uses a placeholder team id, bundle id and GoogleService-Info.plist.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appDir = join(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "ios-check-"));
const plist = join(tmp, "GoogleService-Info.plist");
writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>BUNDLE_ID</key><string>com.example.prayalong</string>
<key>GOOGLE_APP_ID</key><string>1:000000000000:ios:0000000000000000</string>
<key>GCM_SENDER_ID</key><string>000000000000</string>
<key>PROJECT_ID</key><string>demo-prayerapp</string>
<key>API_KEY</key><string>placeholder</string>
</dict></plist>
`);

const env = {
  ...process.env,
  APPLE_TEAM_ID: "ABCDE12345",
  IOS_BUNDLE_ID: "com.example.prayalong",
  REMOTE_PUSH: "1",
  EXPO_PUBLIC_APPLE_SIGN_IN: "1",
  GOOGLE_SERVICES_PLIST: plist,
  CI: "1",
};
const problems = [];
try {
  execFileSync("npx", ["expo", "prebuild", "--platform", "ios", "--no-install", "--clean"], { cwd: appDir, env, stdio: "inherit" });
  const pbx = readFileSync(join(appDir, "ios", "PrayAlong.xcodeproj", "project.pbxproj"), "utf8");

  const memberOf = new Map();
  const groupRe = /\n\t\t([0-9A-F]{24}) \/\* ([^*]*?) \*\/ = \{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = \(\n([\s\S]*?)\t\t\t\);/g;
  for (const [, , name, children] of pbx.matchAll(groupRe)) {
    for (const [id] of children.matchAll(/[0-9A-F]{24}/g)) memberOf.set(id, [...(memberOf.get(id) ?? []), name]);
  }
  for (const [id, groups] of memberOf) {
    if (groups.length > 1) problems.push(`${id} is in more than one group: ${groups.join(", ")} (Xcode won't open the project)`);
  }
  for (const target of ["PrayAlong", "ExpoWidgetsTarget", "LiveActivity"]) {
    if (!new RegExp(`isa = PBXNativeTarget;[\\s\\S]*?name = "?${target}"?;`).test(pbx)) problems.push(`target ${target} is missing`);
  }
  if (!pbx.includes("FirebaseCrashlytics/run")) problems.push("Crashlytics' symbol upload step is missing");
} catch (err) {
  problems.push(`prebuild failed: ${err.message}`);
} finally {
  rmSync(join(appDir, "ios"), { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
}

if (problems.length) {
  console.error(`\niOS project check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\niOS project check passed: opens in Xcode, all targets present.");
