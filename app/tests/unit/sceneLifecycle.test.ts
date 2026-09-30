import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { patchAppDelegate } = require("../../plugins/withSceneLifecycle");

// Runs the patch against the AppDelegate in the installed Expo template, so an
// Expo update that changes the template fails here instead of at app launch.
function templateAppDelegate(): string {
  const dir = mkdtempSync(join(tmpdir(), "expo-template-"));
  execFileSync("tar", ["xzf", require.resolve("expo/template.tgz"), "-C", dir]);
  return readFileSync(join(dir, "package/ios/HelloWorld/AppDelegate.swift"), "utf8");
}

test("AppDelegate hands window creation to the scene delegate (iOS 27 requirement)", () => {
  const out: string = patchAppDelegate(templateAppDelegate());
  expect(out).toContain("class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
  expect(out).not.toContain("UIWindow(frame: UIScreen.main.bounds)");
  expect(out).not.toMatch(/factory\.startReactNative\(/);
  // The factory is still created, so the scene delegate can start React Native.
  expect(out).toContain("reactNativeFactory = factory");
  // Idempotent.
  expect(patchAppDelegate(out)).toBe(out);
});

test("keeps code other plugins insert in the same block (React Native Firebase)", () => {
  const withFirebase = templateAppDelegate().replace(
    "    window = UIWindow(frame: UIScreen.main.bounds)\n",
    "    window = UIWindow(frame: UIScreen.main.bounds)\nFirebaseApp.configure()\n",
  );
  expect(withFirebase).toContain("FirebaseApp.configure()");
  const out: string = patchAppDelegate(withFirebase);
  expect(out).toContain("FirebaseApp.configure()");
  expect(out).not.toContain("UIWindow(frame: UIScreen.main.bounds)");
  expect(out).not.toMatch(/factory\.startReactNative\(/);
});

test("refuses to guess when the template has changed", () => {
  expect(() => patchAppDelegate("class Something {}")).toThrow(/expected Expo template/);
});
