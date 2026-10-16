# TestFlight: friends install Pray Now from a link

Needs the paid Apple Developer Program and `APPLE_TEAM_ID` in `app/.env.device` (see `ios-device-build.md`, part C). The TestFlight build uses the same settings as `npm run ios:device`: the real Firebase project, Google and Apple sign-in, push only once it's turned on.

## 1. Create the app in App Store Connect (once)

1. Go to **appstoreconnect.apple.com** → **Apps** → **+** → **New App**.
2. Fill in:
   - **Platforms:** iOS
   - **Name:** Pray Now. It must be unique on the App Store; if it's taken, try something like "Pray Now: daily prayer". You can change it before release.
   - **Primary language:** English
   - **Bundle ID:** pick `com.joelpang.praynow`. It's listed because Xcode registered it during the first device build.
   - **SKU:** any private label, e.g. `praynow`
   - **User access:** Full access
3. Click **Create**.

## 2. Build and upload (each new version)

```sh
cd ~/prayerapp/app && npm run ios:testflight
```

It regenerates the iOS project, archives a Release build signed for distribution with your team, and uploads it. Xcode gives each upload a new build number, so nothing needs bumping. It takes 10–20 minutes. If macOS asks for your keychain password, choose **Always Allow**.

The app declares that it uses only standard encryption (HTTPS), so App Store Connect doesn't ask about export compliance.

## 3. Add testers

After the upload, Apple processes the build (5–30 minutes; you get an email). Then, in App Store Connect → your app → **TestFlight**:

- **Internal testing** (no review): people who are users on your App Store Connect team, up to 100. Add them under **Users and Access** first, then to an internal group. Useful for yourself and a co-maintainer.
- **External testing** (friends; needs a quick Beta App Review for the first build, usually within a day):
  1. Fill in **Test Information**: a short description of what to test, and your feedback email. Apple may also ask for a privacy policy URL.
  2. Create a group (e.g. "Friends"), add the build, and submit it for review.
  3. Once approved, turn on **Public Link** and send the link. Friends install the **TestFlight** app from the App Store, then open your link.
  4. **Sign-in for the reviewer:** the app signs in with Apple or Google, which reviewers can use with their own accounts. Say so in the review notes ("Sign in with Apple or Google; no demo account needed").

TestFlight builds expire after 90 days; upload a new one before then.

## Back to the Simulator afterwards

```sh
npx expo prebuild --clean -p ios && npm run ios -- --port 8082
```
