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

## Needed from you before integration

1. **The daily window, and its time zone.** For example: "between 08:00 and 21:00, America/Chicago". Because v1 is global, everyone gets the prompt at the same moment, so people in other time zones may get it at night. That's inherent to the global design; per-user timing is the v2 idea.
2. **Fixed or varying hours:** the same window every day, or different hours on weekends?

## Running the prototype

**Server:** from `firebase/`, after the main deploy:
```sh
npm --prefix notify-proto install
npx firebase deploy --only functions:notify-proto     # separate codebase
node scripts/proto-run.mjs --project prayerapp-4ce99 --in 90
```
The script reports four timings: enqueued, fired (seconds after the chosen moment), sent (how quickly FCM accepted it), and the message id. It uses your normal `gcloud auth application-default login`; no extra role is needed. To remove the prototype afterwards: `npx firebase functions:delete protoScheduleRun protoFirePrompt --force`.

**App:** from `prototypes/notify-app/`:
- **Android emulator (possible now):**
  1. In Firebase console, add an Android app with package `com.example.prayerapp.pushproto`, or your own via `PROTO_IOS_BUNDLE_ID`, which sets both.
  2. Put `google-services.json` in this folder.
  3. Run `npm install && npm run android`.
- **iPhone (after the paid account):**
  1. In Firebase console, add an iOS app with the prototype's bundle id, and put `GoogleService-Info.plist` in this folder.
  2. Upload an APNs key (Apple Developer, then Keys) in Firebase, under Project settings, then Cloud Messaging.
  3. Run `npm install && npm run ios:device`.
- **In the app:** tap **Allow notifications**, then **Subscribe**.

### Test plan: record each result

Send `proto-run.mjs` several times and note what the phone shows each time:

| # | App state when the push fires | Expect |
|---|---|---|
| 1 | Open (foreground) | The countdown starts, and the app shows delivery latency |
| 2 | Backgrounded | An alert appears, and tapping it opens the countdown |
| 3 | Swiped away / killed | An alert appears, and tapping it opens the countdown |
| 4 | Locked, screen off | The alert is on the lock screen. Note its timestamp against "fired" |
| 5 | Focus / Do Not Disturb on | With Time Sensitive allowed, the alert breaks through; without it, it doesn't |
| 6 | Low Power Mode on | Note any delay |
| 7 | Airplane mode, then off within the hour | The alert arrives when back online, with less time shown |
| 8 | Airplane mode for over an hour | No alert, because it expired. This is correct |
| 9 | Two runs a minute apart | Two separate prompts, with nothing merged wrongly |

Latencies to watch: fired-to-sent should be under 1 s. Sent-to-shown on the phone is normally a few seconds, but can be longer on iOS when the phone is asleep; that's the real-world number we need.

## After it works: integration plan

These are separate steps, and each gets its own tests:
1. **Scheduler:** a daily function (`onSchedule`) picks the day's moment and writes a *server-only* schedule doc, so the time can't be read in advance. It then schedules the Cloud Task. When the task fires, it writes `prompts/{date}` with `firedAt` and the day's `verseRef` from `verse-list.json`, then sends the push to the real topic.
2. **App:** move `promptWindow.ts` into `app/src/lib/`, and add React Native Firebase messaging, permission onboarding and a topic subscription. The Today screen then shows the live countdown. It already reacts to a new prompt within seconds through Firestore, even if a push is late.
3. **Remove** the prototype codebase and app.
