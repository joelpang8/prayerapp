# Step 4: the daily prompt, push and countdown

## How it works

```
planDailyPrompt (07:00 New York) ──creates──▶ promptSchedule/{date} {fireAt, verseRef}
                                               (server-only: clients are denied, so the
                                                moment can't be seen in advance)
          │ schedulePromptTask (on create)
          ▼
   Cloud Task, scheduleTime = fireAt
          │ firePrompt, at fireAt
          ▼
   prompts/{date} {firedAt, verseRef}  ──and──▶  one FCM push to the topic "prompt"
   (the app shows it on Today via Firestore)      (every subscribed phone; no tokens stored)
```

- **The moment:** a uniformly random second in **08:00–21:00 America/New_York**, the same window every day, from a cryptographic RNG (`pickFireTime`). Daylight-saving changes are handled. The planner doesn't log it.
- **Precise and never early:** Cloud Tasks fires at `fireAt`. A delivery a few seconds early waits; a much earlier one is pushed back to the queue.
- **Exactly once:** Cloud Tasks delivers at least once. Only the first attempt creates the prompt and claims `firedAt`; after the send, retries do nothing. If the send succeeded but recording it failed, a retry sends again, and the collapse id makes the phone replace the alert rather than show two.
- **A prompt sent by hand** that day (`npm run prompt:real`) takes precedence: the scheduled one is skipped with no push.
- **The push:** "Time to pray / Pause and pray right now. You have 2 minutes." Immediate, *time-sensitive* (breaks through Focus if allowed), expires after an hour, carries the server's `firedAt` so the countdown is measured from the server, not from arrival. No verse text, nothing personal.
- **The day's verse:** the curated list (`functions/src/verse-list.json`) in order, one per calendar day.

Code: `firebase/functions/src/dailyPrompt.ts` (pure parts) and the three functions in `index.ts`. Tests: `firebase/tests/daily-prompt.test.js` (timing, verse, message, the schedule's secrecy, and end-to-end runs in the emulators).

## In the app

- **Subscription** (`app/src/lib/push.ts`): in push builds, the phone subscribes to the `prompt` topic while the app's notifications switch is on and the phone allows notifications, and unsubscribes when either is off.
- **Showing and tapping:** alerts show even while the app is open; tapping one opens Today (`notifications.ts`, plus React Native Firebase's tap events in `push.ts`).
- **Countdown:** Today shows 2:00 to pray, then the 5-minute grace period, then "it will be marked late", with the candle. Measured from the prompt's `firedAt`.
- **Push builds only:** React Native Firebase is linked only when `REMOTE_PUSH=1` (`app/react-native.config.js`). Simulator builds don't include it and need no plist.

### Lock screen countdown (Live Activity)

- `app/src/lib/liveActivity.ts` decides (tested); `app/src/session/useLiveActivity.ts` starts and ends it with `expo-live-activity`, only while the app is in front.
- Starts when the app is open during the on-time window and there's no post (or queued post) for the prompt; one per prompt, remembered across restarts. Ends on posting, at the window's end while the app is open, or when switched off in Settings.
- Nothing from the server: no push-to-start or activity push tokens.
- The widget extension (`LiveActivity` target) is generated at prebuild. `plugins/withTeamForAllTargets.js` gives it your team. The first device or TestFlight build after adding it may need the one-time Xcode Signing step for the **LiveActivity** target too (`ios-device-build.md`, part C).
- The Simulator shows Live Activities on its lock screen (Device → Lock), so it can be tried without a phone.

### Setup for a push build

1. APNs key (Apple Developer → Keys, "Apple Push Notifications service") uploaded in Firebase → Project settings → Cloud Messaging, for the iOS app with the app's bundle id (development and production).
2. That iOS app's `GoogleService-Info.plist` in `app/` (git-ignored).
3. `REMOTE_PUSH=1` in `app/.env.device`. `npm run ios:device -- --check` checks the plist matches the bundle id.
4. The first build after turning push on may need the one-time Xcode profile step (`ios-device-build.md`, part C).

## Testing

- **Without waiting for tomorrow:** `npm run prompt:schedule -- --in 2 --yes` (in `firebase/`) schedules today's prompt two minutes from now through the same server path. It refuses if today already has a prompt or schedule.
- **Logs:** `npx firebase functions:log --only planDailyPrompt` ("daily prompt planned") and `--only firePrompt` ("daily prompt sent").
- **Simulator:** `npm run dev:prompt` writes a prompt to the emulators and drops a notification into the booted Simulator. Xcode 27's Simulator refused simulated pushes ("Source is not authorized"), so real alerts need a phone.

## History

The push path was first built as a standalone prototype (its own Functions codebase and a small app), as the brief asked. In October 2026 it was proven on an iPhone: the alert arrived with the app open, in the background, swiped away and with the phone locked. It was then integrated as above, confirmed on the phone, and the prototype was removed.
