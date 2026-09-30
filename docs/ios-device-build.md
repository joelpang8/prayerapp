# Running the app on your iPhone (Mac + Xcode)

I wrote and checked this on Linux, with no Mac, so **none of these steps have been run yet**. If a step doesn't match what you see (Xcode and the Firebase console change often), tell me the exact screen or error and I'll adjust.

There are two ways to run the app:

- **A. Simulator + local emulators.** No Firebase project and no Apple Developer account needed. Uses the "Development sign-in" button. This is the fastest way to try the friend flows.
- **B. Your iPhone + a real Firebase project.** Needed for real Apple and Google sign-in.

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
4. **Send a prompt.** Terminal 3: `cd firebase && npm run dev:prompt`. Today switches to **Time to pray** with today's verse. To see the late label, use `npm run dev:prompt -- --minutes-ago 10` instead.
5. **Post:** tap **Pray now**, then **Choose photo (development)** (the Simulator has no camera; its Photos app has sample pictures), write notes, then **Post**.
6. **Friends:** Settings, then **Sign out**. Sign in as "Bob" and choose a username. On Friends, find Alice by her username and tap **Add friend**. Sign out, sign back in as Alice, and **Accept**. Each account's posts now appear in the other's feed. Remove the friendship and they disappear.

The Simulator reaches the emulators at `127.0.0.1`, so no other network setup is needed.

**If something goes wrong:**
- **Red screen or "Unable to connect to Metro":** Terminal 2 must still be running. Press `r` there to reload.
- **"Development sign-in" is missing:** `EXPO_PUBLIC_USE_EMULATORS=1` isn't set. After changing `.env`, stop Terminal 2 and run `npm run ios` again.
- **Sign-in or loading spins forever:** the emulators aren't running, or they were restarted. Restarting wipes the data, so sign up again.
- **Build error mentioning pods:** run `cd app/ios && pod install`, then `npm run ios` again. If that fails, send me the last 30 lines of the error.
- **Photos don't appear on posts:** tell me. Photos load as raw bytes through the security rules, and that one piece hasn't been checked in a real iOS runtime yet.

## B. Your own iPhone against a real Firebase project

### B1. Apple Developer account

**Sign in with Apple needs the paid Apple Developer Program ($99/year).** A free "Personal Team" can put an app on your phone, but it can't use the Sign in with Apple capability, and its builds expire after 7 days. If you want to hold off on paying: Google sign-in works with a free team if you temporarily remove `usesAppleSignIn` from `app.config.ts`. Ask me and I'll make that switch clean.

1. Enrol at developer.apple.com and wait for approval.
2. Choose a bundle id, such as `com.yourname.praynow`. It must be unique on the App Store, and you'll use it everywhere below.

### B2. Firebase project

1. At console.firebase.google.com, create a project. You can turn Analytics off.
2. **Authentication → Sign-in method:**
   - Enable **Apple**. For a native iOS app you don't need a Services ID or key. Those are only for web and Android sign-in.
   - Enable **Google**. Open its **Web SDK configuration** and copy the **Web client ID**. That value goes in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   - Make sure **Anonymous** is disabled. The rules reject it anyway.
3. **Firestore Database:** create it in *production mode*, in a region near you. You can't change the region later.
4. **Storage:** get started, in the same region.
5. **Project settings → Your apps:**
   - Add an **iOS app** with your bundle id. Download `GoogleService-Info.plist`, but *don't* add it to the project. Just open it and copy two values:
     - `CLIENT_ID` goes in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
     - `REVERSED_CLIENT_ID` goes in `GOOGLE_IOS_URL_SCHEME`.
   - Add a **Web app**. Its config object provides the six `EXPO_PUBLIC_FIREBASE_*` values. The app uses the Firebase JS SDK, which is configured with these.
6. Deploy the rules from `firebase/`:
   ```sh
   npx firebase login
   npx firebase use --add          # pick the project, alias "default"
   npx firebase deploy --only firestore,storage,functions:default   # see production-checks.md
   ```
   On the first Storage deploy, Firebase asks to **let Storage read Firestore**. Say yes. The photo rules check your friendships through Firestore.

### B3. Configure and build

1. In `app/.env`, fill in every value from B2, plus `IOS_BUNDLE_ID`. Leave `EXPO_PUBLIC_USE_EMULATORS` commented out.
2. Generate the native project: `cd app && npx expo prebuild --platform ios --clean`. Re-run this whenever `app.config.ts` or `.env` changes the bundle id or URL scheme.
3. Open `app/ios/*.xcworkspace` in Xcode. Open the `.xcworkspace`, not the `.xcodeproj`.
4. Select the app target, then the **Signing & Capabilities** tab:
   - Tick **Automatically manage signing**.
   - **Team:** choose your developer team.
   - Check the **Bundle Identifier** matches your bundle id.
   - Check that **Sign in with Apple** is listed. `usesAppleSignIn` adds it. If Xcode shows a red error, it usually means the App ID hasn't picked up the capability yet. Clicking "Try Again" normally fixes it.
5. On the iPhone:
   - Connect it by cable and tap **Trust This Computer**.
   - Turn on **Settings → Privacy & Security → Developer Mode**. The phone restarts.
6. In Xcode, choose your iPhone as the run destination (top bar) and press **Run** (⌘R).
   - If the phone says "Untrusted Developer", go to **Settings → General → VPN & Device Management**, pick your developer profile and tap **Trust**.
7. The app on the phone is a *development build*. It loads its JavaScript from Metro on your Mac, so run `npm start` in `app/`. The phone and Mac must be on the same Wi-Fi. After this first time, `npm run ios:device` builds and installs without opening Xcode.

## Checking the friend flows by hand (step 1 acceptance)

You need two accounts. Use the Simulator plus your phone, or two Simulators in emulator mode.

- [ ] Sign in with Apple and with Google each land on "Set up your profile". Apple fills in your name the first time only.
- [ ] A username someone already has gives "@name is taken".
- [ ] Find the other account by username. **Add friend** shows "Request sent", and the other account sees a badge and a request.
- [ ] Accept: both accounts show each other under **Friends**.
- [ ] Remove, and confirm: both lists are empty straight away, with no leftover request on either side.
- [ ] Sign out, then back in as a different account: none of the first account's friends appear.
