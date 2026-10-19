# Updating PrayAlong

The routine for every change, from the code landing on GitHub to it showing on phones.

## 1. Get the latest code (always)

```sh
cd ~/prayerapp && git pull
cd app && npm install
cd ../firebase && npm install && npm --prefix functions install
```

`npm install` is quick when nothing changed, and it avoids "Failed to resolve plugin / module not found" after a change adds a package.

## 2. Look at it first (optional, Simulator)

Three tabs:

```sh
cd ~/prayerapp/firebase && npm run emulators                                   # tab 2: local backend
cd ~/prayerapp/app && npx expo prebuild --clean -p ios && npm run ios -- --port 8082   # tab 1: build + Metro
cd ~/prayerapp/firebase && npm run dev:prompt                                  # tab 3: a prompt to post to
```

The `prebuild` line is only needed after a change that adds a native package, or after building for a phone (it switches the iOS project back to the Simulator). For screen and wording changes, just press `r` in a running Metro tab.

## 3. If the change touches the server (rules, indexes or functions)

Most app-only changes skip this. The change's notes say when it's needed.

```sh
cd ~/prayerapp/firebase && npx firebase deploy --only firestore,storage,functions:default
```

After changes to rules, indexes or functions, rerun the production checks (`production-checks.md`).

## 4. Your own phone (fastest, by cable)

```sh
cd ~/prayerapp/app && npm run ios:device
```

5–15 minutes. Replaces the app on your phone, keeping your account and posts (they're on the server). If it fails with "No profiles…" or "does not support the … capability", do the one-time Xcode step the script prints.

## 5. Testers (TestFlight)

```sh
cd ~/prayerapp/app && npm run ios:testflight
```

1. Wait for Apple's email (5–30 minutes): "completed processing", or a list of issues to fix.
2. App Store Connect → PrayAlong → TestFlight: add the new build to the **Internal** group (and **Friends**; the first build of a new version may need a quick Beta App Review).
3. Testers get "update available" in the TestFlight app.

Build numbers go up by themselves. To show a new version number (e.g. 0.2.0), change `version` in `app/app.config.ts` first.

Tip: in App Store Connect you can turn on **automatic distribution** for the Internal group, so step 2 happens by itself for internal testers.

## Which steps for which change

| Change | Pull + install | Deploy (3) | Your phone (4) | Testers (5) |
|---|---|---|---|---|
| Screens, wording, colors | ✓ | | ✓ | ✓ |
| A new native package (e.g. a sound or camera feature) | ✓ | | ✓ | ✓ |
| Security rules or indexes | ✓ | ✓ | | |
| Server functions (e.g. the daily prompt) | ✓ | ✓ | | |
| A feature with both app and server parts | ✓ | ✓ first | ✓ | ✓ |
