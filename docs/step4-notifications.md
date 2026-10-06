# Step 4: notifications and countdown (standalone prototype)

As the brief asks, this is **isolated from the app**. It has its own Functions codebase (`firebase/notify-proto/`) and its own small Expo app (`prototypes/notify-app/`). Nothing in `app/` or `firebase/functions/` uses it. It gets integrated only after it has worked on real devices.

## Design (global prompt, v1)

```
admin script ──writes──▶ protoRuns/{id} {fireAt}        (clients denied by the rules)
                              │ onDocumentCreated
                              ▼
                   Cloud Task, scheduleTime = fireAt
                              │ at fireAt
                              ▼
       protoFirePrompt: record firedAt once ──▶ FCM topic "proto-prompt" ──▶ every subscribed device
                                                  (one send, no per-user push tokens stored)
```

- **Precise timing: Cloud Tasks.** The task is scheduled for the exact moment. If a task is delivered a few seconds early (the emulator did this), the handler **waits** until the chosen moment, so a prompt is never sent early. If it's delivered much too early, the task is retried later.
- **At-least-once delivery handled.** Cloud Tasks can deliver a task more than once. Only the first attempt records `firedAt`, and once the push has been sent a retry does nothing. If the send succeeded but recording it failed, a retry sends again. In that case the collapse id and tag make the phone *replace* the alert, not show two.
- **Everyone at once: one FCM topic push.** Nobody's device token is stored, which is good for privacy and means there's no token database to maintain.
- **The push carries the server's `firedAt`.** The countdown is measured from when the server fired, not from when the push arrived. A late push honestly shows less time left, because on-time vs late is decided by the server clock (as in the step 2 rules).
- **The iOS alert** is sent as immediate priority, *time-sensitive* (so it can break through Focus if the user allows), expires after 1 hour, and collapses duplicates. The text is "Time to pray / Pause and pray right now. You have 2 minutes." It contains no verse text and nothing personal.
- **Picking the moment:** `pickFireTime(date, window)` picks a uniformly random second inside a daily window, using a cryptographic RNG so the time can't be predicted. It handles daylight-saving changes; a nonexistent 2:30 am on the spring-forward day moves forward. A daily planner that calls it is part of **integration**, not this prototype. The prototype fires only when you run the script.

## Proven so far (in the emulators, 11 tests)

- A run fires at its scheduled moment and never early. Measured: **0.03 s after the chosen time**. A past moment fires immediately, and each run sends exactly once.
- The push payload has the right priority, expiry and collapse settings, and matches the 2 + 5 = 7-minute window used by the app and the rules.
- Random times are always inside the window and spread across it. The daylight-saving and date-in-time-zone logic is tested.
- `protoRuns` is closed to all clients.
- The countdown logic (`prototypes/notify-app/src/promptWindow.ts`) has 7 tests. It moves from respond to grace to late at the exact boundaries, and shows less time for a delayed push.

**Not proven, and it can only be proven on real devices:** that pushes arrive, how late, and in which app states. That's the point of the prototype.

## Blocker for iPhone: paid Apple Developer account

- **Push needs a paid account.** Real push on iOS requires the **Push Notifications** capability and an **APNs key** uploaded to Firebase, and the free Apple account can't create either. So on iPhone, the prototype waits on the paid account, just like Sign in with Apple.
- **Android works now, with no Apple account.** An Android emulator from Android Studio, with a *Google Play* system image, receives real FCM pushes. The whole server path, timing and countdown can be validated there first.
- **The iOS Simulator can test handling but not delivery.** `xcrun simctl push booted <bundle id> payload.apns` injects a notification locally. It shows how the app reacts to the alert, but not whether it arrives.

## Decided for integration

- The daily window is **08:00–21:00 America/New_York, the same every day**.

## Already in the app (works in the Simulator, no Apple account)

- **Permission:** a "Turn on notifications" card on Today, and a Notifications section in Settings (with "Open phone Settings" if it was refused). The app never asks at launch.
- **Showing and tapping:** prompts show as alerts even while the app is open; tapping one opens Today (`app/src/lib/notifications.ts`). Android gets a high-importance "prompt" channel.
- **Development:** `npm run dev:prompt` (in `firebase/`) also tries to drop a "Time to pray" notification into the booted Simulator with `xcrun simctl push`. Use `--no-notify` to skip it.
- **Known limit, Xcode 27 / iOS 27 Simulator:** it refused every simulated push with `UNErrorDomain 2003 "Source is not authorized"`, even to our app with notifications allowed, and to Apple's Reminders. (On iOS 27 the same error also means the app hasn't asked for permission yet, so rule that out first.) So on this Xcode, seeing a real notification needs the Android emulator (the device test below) or a real iPhone with the paid account.
- **Not yet:** receiving real pushes. That's integration step 2 below, after the device test. The push entitlement is left out of builds unless `REMOTE_PUSH=1` is set in `app/.env`, because it needs the paid Apple account (like Sign in with Apple).

## Running the prototype

**Server:** from `firebase/`, after the main deploy:
```sh
npm --prefix notify-proto install
npx firebase deploy --only functions:notify-proto     # separate codebase
node scripts/proto-run.mjs --project prayerapp-4ce99 --in 90
```
The script reports four timings: enqueued, fired (seconds after the chosen moment), sent (how quickly FCM accepted it), and the message id. It uses your normal `gcloud auth application-default login`; no extra role is needed. To remove the prototype afterwards: `npx firebase functions:delete protoScheduleRun protoFirePrompt --force`.

**App on an Android emulator (possible now, no Apple account needed).** On your Mac:

1. **Install Android Studio** (developer.android.com/studio). On first launch, let it install the Android SDK. Then add this to `~/.zshrc` and open a new terminal:
   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   ```
   Android Studio also bundles the Java version Android builds need. If a build later complains about Java, set `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
2. **Create the emulator.** In Android Studio, open **Device Manager**, then **Create virtual device**, and pick a Pixel. For the system image, choose one whose target says **Google Play**, API 35 or newer. It must be a *Google Play* image: plain "Google APIs" or AOSP images have no Play services, and FCM can't deliver to them. Start the emulator.
3. **Register the prototype in Firebase.** In the console, go to Project settings, then **Add app**, then Android. Use package `com.example.prayerapp.pushproto`, or your own if you set `PROTO_BUNDLE_ID` before building. Download `google-services.json` into `prototypes/notify-app/`. It's git-ignored.
4. **Build and install:**
   ```sh
   cd prototypes/notify-app
   npm install
   npm run android        # first build takes several minutes; installs on the running emulator
   ```
   `npm run android` also starts Metro, which the development build loads its JavaScript from. Keep that terminal open.
5. **In the app:** tap **Allow notifications**. On Android 13 and later this shows the system prompt; allow it. Then tap **Subscribe**.
6. **Deploy the prototype functions and send a test.** See **Server** above. Then run `node scripts/proto-run.mjs --project prayerapp-4ce99 --in 60` and watch the emulator.

If nothing arrives, check in this order:
- Permission shows "authorized".
- The emulator image is a Google Play one.
- The topic shows "subscribed" (Subscribe needs internet in the emulator).
- `npx firebase functions:log --only protoFirePrompt` shows "prototype prompt sent".
- On a fresh emulator, signing into a Google account in the emulator's Settings sometimes wakes up Play services.

**App on iPhone (after the paid account):**
1. In the Firebase console, add an iOS app with the prototype's bundle id, and put `GoogleService-Info.plist` in `prototypes/notify-app/`.
2. Upload an APNs key (Apple Developer, then Keys) in Firebase, under Project settings, then Cloud Messaging.
3. Run `npm run ios:device`, then tap **Allow notifications** and **Subscribe**.

### Test plan: record each result

Send `proto-run.mjs` several times and note what the phone shows each time:

| # | App state when the push fires | Expect |
|---|---|---|
| 1 | Open (foreground) | The countdown starts, and the app shows delivery latency |
| 2 | Backgrounded | An alert appears, and tapping it opens the countdown |
| 3 | Swiped away / killed | An alert appears, and tapping it opens the countdown |
| 4 | Locked, screen off (Android emulator: power button) | The alert is on the lock screen. Note its timestamp against "fired" |
| 5 | Focus / Do Not Disturb on | With Time Sensitive allowed, the alert breaks through; without it, it doesn't |
| 6 | Low Power Mode on | Note any delay |
| 7 | Airplane mode, then off within the hour | The alert arrives when back online, with less time shown |
| 8 | Airplane mode for over an hour | No alert, because it expired. This is correct |
| 9 | Two runs a minute apart | Two separate prompts, with nothing merged wrongly |
| 10 | Android only: Doze. Run `adb shell dumpsys deviceidle force-idle`, then send. Afterwards run `adb shell dumpsys deviceidle unforce`. | A high-priority push still arrives promptly. Doze is what an idle, locked phone does |
| 11 | Android only: notifications turned off for the app in Settings | Nothing is shown, and the app reports the permission as not granted |

Latencies to watch: fired-to-sent should be under 1 s. Sent-to-shown on the phone is normally a few seconds, but can be longer on iOS when the phone is asleep; that's the real-world number we need.

## After it works: integration plan

These are separate steps, and each gets its own tests:
1. **Scheduler:** a daily function (`onSchedule`) picks the day's moment and writes a *server-only* schedule doc, so the time can't be read in advance. It then schedules the Cloud Task. When the task fires, it writes `prompts/{date}` with `firedAt` and the day's `verseRef` from `verse-list.json`, then sends the push to the real topic.
2. **App:** move `promptWindow.ts` into `app/src/lib/`, and add React Native Firebase messaging and a topic subscription. (Permission and tap handling are already in the app.) The Today screen then shows the live countdown. It already reacts to a new prompt within seconds through Firestore, even if a push is late.
3. **Remove** the prototype codebase and app.
