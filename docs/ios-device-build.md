# Running the app on your iPhone (Mac + Xcode)

I wrote this on Linux, with no Mac. **Part A has been run on your Mac; part B has not been run yet.** If a step doesn't match what you see (Xcode and the Firebase console change often), tell me the exact screen or error and I'll adjust.

There are two ways to run the app:

- **A. Simulator + local emulators.** No Firebase project and no Apple Developer account needed. Uses the "Development sign-in" button. This is the fastest way to try the friend flows.
- **B. Your iPhone + your real Firebase project, with a free Apple account.** Google sign-in only; no Sign in with Apple or push until you have the paid program.

---

## 0. One-time Mac setup

1. Install **Xcode** from the App Store. Open it once and let it install its extra components.
2. Install the command-line tools: `xcode-select --install`.
3. Install Node 22 and Java: `brew install node@22 openjdk`. Java is only needed for the Firebase emulators. Homebrew's `openjdk` isn't on your PATH by default, so follow the `brew info openjdk` hint (the `sudo ln -sfn ...` line), or add `export PATH="$(brew --prefix openjdk)/bin:$PATH"` to `~/.zshrc`. Check with `java -version`.
4. Install CocoaPods: `brew install cocoapods`. `expo run:ios` uses it to install native dependencies.
5. Install dependencies:
   ```sh
   cd firebase && npm install && npm --prefix functions install && npm --prefix notify-proto install
   cd ../app && npm install
   ```

## A. Simulator against the emulators

1. **Terminal 1, start the backend:** `cd firebase && npm run emulators`. This builds the Cloud Functions, then starts the Auth, Firestore, Storage and Functions emulators with your real rules. Wait for "All emulators ready". Leave it running; stopping it wipes all data.
2. **Terminal 2, configure and build the app:**
   ```sh
   cd app
   cp .env.example .env
   ```
   Edit `app/.env` and remove the `#` from `EXPO_PUBLIC_USE_EMULATORS=1`. Leave everything else empty. Then:
   ```sh
   npm run ios
   ```
   The first run creates `app/ios/`, installs CocoaPods, builds with Xcode (roughly 5–15 minutes the first time) and opens the Simulator. Later runs are much faster. Keep this terminal open: it's Metro, which serves the app's code. Pressing `r` in it reloads the app.
3. **Sign in:** tap **Development sign-in**, type a name such as "Alice", then choose a display name and username. The Google button explains that it isn't set up yet, and the Apple button only appears if the Simulator is signed into an Apple ID.
4. **Send a prompt.** First tap **Turn on notifications** on Today and allow them. Then, in Terminal 3: `cd firebase && npm run dev:prompt`. A **Time to pray** notification appears in the Simulator, and Today switches to **Time to pray** with today's verse. Tapping the notification opens Today. To see the late label, use `npm run dev:prompt -- --minutes-ago 10` instead. There's one prompt and one verse per day, so running it again the same day re-sends today's prompt with the same verse. To try a new prompt (a fresh **Pray now** and the next verse), pretend it's another day: `npm run dev:prompt -- --day 1`, then `--day 2`, and so on.
5. **Post:** tap **Pray now**, then **Choose photo (development)** (the Simulator has no camera; its Photos app has sample pictures), write notes, then **Post**.
6. **Friends:** Settings, then **Sign out**. Sign in as "Bob" and choose a username. On Friends, find Alice by her username and tap **Add friend**. Sign out, sign back in as Alice, and **Accept**. Each account's posts now appear in the other's feed. Remove the friendship and they disappear.

The Simulator reaches the emulators at `127.0.0.1`, so no other network setup is needed.

**If something goes wrong:**
- **"UIScene life cycle is required for apps built with this SDK"** at launch: the native project predates the fix in `app/plugins/withSceneLifecycle.js`. Run `npx expo prebuild --clean -p ios` and build again.
- **"No code signing certificates are available to use"** (even for a Simulator): the Sign in with Apple entitlement is in the native project. Make sure `EXPO_PUBLIC_APPLE_SIGN_IN` isn't set in `.env`, then run `npx expo prebuild --clean -p ios` and build again.
- **Red screen or "Unable to connect to Metro":** Terminal 2 must still be running. Press `r` there to reload.
- **"Development sign-in" is missing:** `EXPO_PUBLIC_USE_EMULATORS=1` isn't set. After changing `.env`, stop Terminal 2 and run `npm run ios` again.
- **Sign-in or loading spins forever:** the emulators aren't running, or they were restarted. Restarting wipes the data, so sign up again.
- **Build error mentioning pods:** run `cd app/ios && pod install`, then `npm run ios` again. If that fails, send me the last 30 lines of the error.
- **No notification appears, or "code=2003" / "Source is not authorized":** on iOS 27 this means the app itself hasn't asked yet. Tap **Turn on notifications** on Today and **Allow** (the switch in the phone's Settings isn't enough). If the app's Settings tab already says notifications are On and it still fails, Xcode 27's Simulator is refusing simulated pushes altogether (see `step4-notifications.md`); the prompt still appears on Today. Also check that the bundle id matches: the script uses `IOS_BUNDLE_ID` from `app/.env`, or `com.example.prayerapp`. You can pass `--bundle-id <id>`.
- **Photos don't appear on posts:** tell me. Photos load as raw bytes through the security rules, and that one piece hasn't been checked in a real iOS runtime yet.

## B. Your iPhone with a free Apple account (Personal Team), against your real Firebase project

`npm run ios:device` builds a version for your own iPhone that a free Apple account can sign:

- **Google sign-in only.** Sign in with Apple and push notifications are left out, because both need the paid Apple Developer Program. (Development sign-in only exists with the emulators.)
- **Your real Firebase project**, `prayerapp-4ce99`. Emulator mode is forced off.
- **A Release build:** the app runs on its own, without your Mac or Metro.
- **Its settings live in `app/.env.device`**, separate from `app/.env`, which stays set up for the Simulator.

**Free-account limits:** the app stops opening after **7 days** (run `npm run ios:device` again to renew it). You can have at most 3 such apps on a phone. And you can register at most 10 new bundle ids a week, so pick one and keep it.

### B1. Xcode signing (once)

1. Open Xcode, then **Xcode → Settings… (⌘,) → Accounts**.
2. Click **+**, choose **Apple ID**, and sign in with your normal Apple ID.
3. Select the team named **"Your Name (Personal Team)"**, click **Manage Certificates…**, then **+** → **Apple Development**, then **Done**.

This certificate is what was missing behind the earlier "No code signing certificates are available" error.

### B2. iPhone (once)

1. Connect the iPhone by cable, unlock it, and tap **Trust This Computer**.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode**, turn it on, and let the phone restart. If Developer Mode isn't listed, open **Window → Devices and Simulators** in Xcode while the phone is connected, then look again.

### B3. Your bundle id

Choose a reverse-DNS id that's yours alone, for example `com.joelpang.praynow`. Apple rejects one another account has used, and `com.example.*` isn't allowed. You'll use it in B4 and B5.

### B4. Firebase (once)

1. **Deploy the backend.** From `firebase/`, run `npx firebase login`, then `npx firebase deploy --only firestore,storage,functions:default`. Run it again even if you've deployed before: the rules have changed since (profile photos, comments, location). If Firebase asks to let Storage read Firestore, say yes.
2. **Turn on Google sign-in.** Go to **Authentication → Sign-in method → Add new provider → Google**, enable it, choose your support email, and **Save**. Open it again and expand **Web SDK configuration**. Copy the **Web client ID**.
3. **Add the iOS app.** Go to **Project settings (gear) → Your apps → Add app → iOS**:
   - Enter your bundle id from B3 exactly, then **Register app**.
   - Download **GoogleService-Info.plist**, but don't add it to the project. Open it in TextEdit and copy two values: `CLIENT_ID` and `REVERSED_CLIENT_ID`.
   - Click **Next** through the remaining steps; they don't apply to this app.
4. **Web app config.** Still under **Your apps**:
   - If there's no Web app yet, use **Add app → Web (</>)**, give it any nickname, and register it.
   - In the Web app's **SDK setup and configuration**, choose **Config**. It shows `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` and `appId`.

### B5. Fill in `app/.env.device`

```sh
cd ~/prayerapp/app
cp .env.device.example .env.device
open -e .env.device
```

Fill in every value. The file says where each one comes from, and the project id, auth domain and bucket are already filled in. Save it, then check it:

```sh
npm run ios:device -- --check
```

This catches common mistakes: an empty value, `com.example.*`, a URL scheme that doesn't match the iOS client id, or the iOS and Web client ids swapped. It also confirms the build has no entitlements that need the paid account.

### B6. Build and install

1. Connect the iPhone and unlock it.
2. Run `npm run ios:device`. When asked, **choose your iPhone** from the list. The first build takes 5–15 minutes.
3. If macOS asks for your keychain password ("codesign wants to access key"), type your Mac login password and click **Always Allow**.
4. **The first time only**, on the iPhone, go to **Settings → General → VPN & Device Management**, tap your Apple ID under **Developer App**, and tap **Trust**. Then open **Pray Now**.

### B7. Using it

- **Sign in with Google**, then choose your name and username.
- **There's no automatic daily prompt yet** (the step 4 scheduler isn't built yet). Send one by hand from your Mac. The first time, sign in for scripts:
  ```sh
  brew install --cask google-cloud-sdk
  gcloud auth application-default login
  gcloud auth application-default set-quota-project prayerapp-4ce99
  ```
  Then, from `firebase/`:
  ```sh
  npm run prompt:real              # shows what it would send
  npm run prompt:real -- --yes     # sends today's prompt
  ```
  It never overwrites a prompt that's already been sent. For another one the same day, use `npm run prompt:real -- --yes --day 1`. There's no push notification, since push needs the paid account; open the app to see the prompt.
- **Friends:** to try friends on real devices, install on a second iPhone the same way (connect it, then `npm run ios:device`), and sign in there with a different Google account.

### If something goes wrong

- **"Failed to register bundle identifier" or "is not available":** another account already uses that id. Change `IOS_BUNDLE_ID` in `.env.device` (and in the Firebase iOS app), then run again.
- **"No code signing certificates are available":** do B1.
- **"Untrusted Developer" or the app won't open:** do the Trust step in B6. If it worked before but has now stopped, the 7 days are up: run `npm run ios:device` again.
- **"Could not launch":** the phone was locked. Unlock it and open the app by hand.
- **Google sign-in says "Error 400: invalid_request" or "custom scheme":** the bundle id in the Firebase iOS app doesn't match `IOS_BUNDLE_ID`, or the client ids don't belong to that iOS app. `--check` catches a mismatched scheme.
- **"requests from referer … are blocked" or `auth/…` errors at sign-in:** the Web API key has website restrictions. In Google Cloud console, under **APIs & Services → Credentials**, allow it (or remove the website restriction).
- **Signed in, but "Couldn't save" or nothing loads:** the rules or index aren't deployed. Do B4 step 1.
- **"Maximum number of apps for free development profiles":** delete an older sideloaded app from the phone.
- **Back to the Simulator afterwards:** in `app/`, run `npx expo prebuild --clean -p ios`, then `npm run ios -- --port 8082`. The phone build uses a different bundle id, so the iOS project is regenerated.

## Checking the friend flows by hand (step 1 acceptance)

You need two accounts. Use the Simulator plus your phone, or two Simulators in emulator mode.

- [ ] Sign in with Apple and with Google each land on "Set up your profile". Apple fills in your name the first time only.
- [ ] A username someone already has gives "@name is taken".
- [ ] Find the other account by username. **Add friend** shows "Request sent", and the other account sees a badge and a request.
- [ ] Accept: both accounts show each other under **Friends**.
- [ ] Remove, and confirm: both lists are empty straight away, with no leftover request on either side.
- [ ] Sign out, then back in as a different account: none of the first account's friends appear.
