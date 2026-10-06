// Builds the app for your own iPhone with a free Apple Personal Team, against
// your real Firebase project. See docs/ios-device-build.md.
//
//   npm run ios:device               # check .env.device, regenerate ios/, build and install
//   npm run ios:device -- --check    # only check .env.device and show what would be built
//
// It always builds:
//  - a Release build: the JavaScript is inside the app, so it runs without
//    your Mac or Metro;
//  - without Sign in with Apple and without push (both need the paid Apple
//    Developer Program; a free team can't sign an app that asks for them);
//  - against the real project: emulator mode is forced off.
// Values come from app/.env.device, never from app/.env (which stays set up
// for the Simulator and the emulators).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const envPath = fileURLToPath(new URL("../.env.device", import.meta.url));
const checkOnly = process.argv.includes("--check");

function fail(lines) {
  console.error(["", ...lines.map((l) => `  ${l}`), ""].join("\n"));
  process.exit(1);
}

if (!existsSync(envPath)) {
  fail([
    "app/.env.device is missing.",
    "Create it from the template:  cp .env.device.example .env.device",
    "then fill it in (docs/ios-device-build.md, part B).",
  ]);
}

/** Minimal .env parsing: KEY=value, # comments, optional quotes. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (/^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/(^|\s+)#.*$/, "").trim();
    out[m[1]] = value;
  }
  return out;
}

const device = parseEnv(readFileSync(envPath, "utf8"));
const problems = [];
const get = (key) => device[key] ?? "";
const required = [
  "IOS_BUNDLE_ID",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "GOOGLE_IOS_URL_SCHEME",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
];
for (const key of required) if (!get(key)) problems.push(`${key} is empty.`);

const bundleId = get("IOS_BUNDLE_ID");
if (bundleId) {
  if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){2,}$/.test(bundleId)) {
    problems.push(`IOS_BUNDLE_ID "${bundleId}" should look like com.yourname.praynow (letters, digits, hyphens, dots).`);
  } else if (/^com\.example\./i.test(bundleId)) {
    problems.push(`IOS_BUNDLE_ID can't be com.example.*: Apple requires an id of your own, e.g. com.yourname.praynow.`);
  }
}

// The URL scheme must be the iOS client id reversed, or Google sign-in
// can't return to the app.
const iosClient = get("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID");
const scheme = get("GOOGLE_IOS_URL_SCHEME");
const clientMatch = /^(.+)\.apps\.googleusercontent\.com$/.exec(iosClient);
if (iosClient && !clientMatch) problems.push("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID should end in .apps.googleusercontent.com (CLIENT_ID in GoogleService-Info.plist).");
if (clientMatch && scheme && scheme !== `com.googleusercontent.apps.${clientMatch[1]}`) {
  problems.push(`GOOGLE_IOS_URL_SCHEME should be com.googleusercontent.apps.${clientMatch[1]} (REVERSED_CLIENT_ID; it must match the iOS client id).`);
}
const webClient = get("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
if (webClient && !webClient.endsWith(".apps.googleusercontent.com")) {
  problems.push("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID should end in .apps.googleusercontent.com (the Web client ID, not the iOS one).");
}
if (webClient && webClient === iosClient) problems.push("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is the iOS client id; use the Web client ID from Firebase > Authentication > Google.");

const projectId = get("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
if (projectId.startsWith("demo-")) problems.push(`EXPO_PUBLIC_FIREBASE_PROJECT_ID is "${projectId}", the emulator project. Use your real one (prayerapp-4ce99).`);

if (problems.length) fail(["app/.env.device needs fixing:", ...problems.map((p) => `- ${p}`)]);

// Device values win; features a free team can't sign are forced off, and so
// is emulator mode. Expo never overrides variables already set here, so
// anything in app/.env (the Simulator setup) can't leak in.
const env = {
  ...process.env,
  ...device,
  EXPO_PUBLIC_USE_EMULATORS: "",
  EXPO_PUBLIC_EMULATOR_HOST: "",
  EXPO_PUBLIC_APPLE_SIGN_IN: "",
  REMOTE_PUSH: "",
};

console.log(`
  iPhone build
  - bundle id:          ${bundleId}
  - Firebase project:   ${projectId} (real project, not the emulators)
  - sign-in:            Google only (Apple sign-in off)
  - push:               off (in-app notification permission still works)
  - build:              Release, runs without your Mac
`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: appDir, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (checkOnly) {
  // Show the resolved native settings, to confirm nothing needs a paid account.
  const r = spawnSync("npx", ["expo", "config", "--type", "introspect", "--json"], { cwd: appDir, env, encoding: "utf8" });
  if (r.status !== 0) fail(["Couldn't read the app config:", r.stderr.trim()]);
  const cfg = JSON.parse(r.stdout);
  const entitlements = Object.keys(cfg.ios?.entitlements ?? {});
  const paid = entitlements.filter((k) => ["com.apple.developer.applesignin", "aps-environment"].includes(k));
  console.log(`  Native bundle id:     ${cfg.ios?.bundleIdentifier}`);
  console.log(`  Entitlements:         ${entitlements.length ? entitlements.join(", ") : "none"}`);
  console.log(`  Google URL scheme:    ${JSON.stringify(cfg.ios?.infoPlist?.CFBundleURLTypes ?? []).includes(scheme) ? "set" : "MISSING"}`);
  if (paid.length) fail([`These need the paid program and would break a free-team build: ${paid.join(", ")}`]);
  console.log("\n  .env.device looks good. Run `npm run ios:device` with your iPhone connected.\n");
  process.exit(0);
}

// Regenerate ios/ for this bundle id (the Simulator build uses another one),
// then build Release and install. With no team preset, Expo signs with the
// Apple Development certificate in your keychain (your Personal Team) and
// lets Xcode create the free provisioning profile.
run("npx", ["expo", "prebuild", "--clean", "--platform", "ios"]);
run("npx", ["expo", "run:ios", "--device", "--configuration", "Release", ...process.argv.slice(2).filter((a) => a !== "--check")]);

console.log(`
  Installed. On the iPhone, the first time:
  - Settings > General > VPN & Device Management > your Apple ID > Trust.
  - The app stops opening after 7 days (free team limit): run this again.
  - To go back to the Simulator later: npx expo prebuild --clean -p ios, then npm run ios.
`);
