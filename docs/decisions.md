# Decisions

## Settled

| Decision | Choice | Why |
|---|---|---|
| Backend | Firebase: Firestore, Cloud Functions, FCM | Given in the brief. |
| Friendship model | Mutual follow. Two one-way `follows` docs means friends. | Access can be checked against live data inside the rules, so no Cloud Function is needed to grant or revoke it. |
| Where post visibility is enforced | Firestore rules, at read time | The server blocks a removed friend on their very next read. No copied friend list can go stale. |
| Anonymous auth | Rejected in the rules | Stops people creating unlimited throwaway identities to spam follow requests. |
| Scripture storage | Posts store only the verse reference, never the text | Given in the brief. Each viewer's chosen version is looked up when the post is shown. |
| Usernames | Lowercase `[a-z0-9_]{3,20}`, unique, can't be changed in v1 | Keeps the rules simple. Changing a username means moving the lookup doc safely, which can wait. |
| Frontend | React Native + Expo (TypeScript), Firebase JS SDK | Confirmed. The JS SDK is chosen so the client data layer can be tested in Node against the emulators. |
| Sign-in | Sign in with Apple + Google | Confirmed. |
| Post editing | Posts are editable and deletable. Edited posts show an "edited" indicator. | Confirmed. `editedAt` is set by the rules, not by the client. |
| "Late" | A label on the post only. No streaks and no comparison between friends. | Confirmed. |
| Prompt timing | Global: everyone is prompted at the same moment (v1) | Confirmed. Per-user timing is a v2 idea and would be a different design. |
| Photo source | Camera only for real users | Confirmed: keeps it true to the moment. The library picker exists only in development builds (`__DEV__`), because the Simulator has no camera. |
| Verse source | One verse reference per daily prompt, the same for everyone, carried onto each post | Confirmed. Posts don't pick their own verse. |
| Verse list | A flat list you curate. No random selection from a larger set, no themes. | Confirmed. |
| Default translation | KJV (public domain) | Confirmed. Ships without waiting on licensing. ESV, NIV and others come later as opt-in, once their licences allow it. |
| KJV text source | Bundled in the app (`es-kjv`, public domain, cross-checked against CrossWire) | Confirmed. No network dependency and no licensing risk. Licensed translations come later through a provider. |
| Reference format | Canonical ids like `PHP.4.6-7`, `JHN.3.16-4.2`, `PSA.23`. Books use USFM codes. Validated against KJV versification. | USFM codes are what Bible APIs use. Ids are strict, so one passage can't be stored in two spellings. |
| Daily prompt window | 08:00–21:00 **America/New_York**, the same every day (no weekend difference) | Confirmed. The global prompt means friends in other time zones sometimes get it at odd hours; that's accepted. Daylight-saving changes are handled by `pickFireTime`. |
| Notifications before the device test | The app asks for notification permission, shows prompts as alerts and opens Today when one is tapped. In development, `npm run dev:prompt` drops the alert into the iOS Simulator. Real pushes wait for the step 4 device test and the paid Apple account (`REMOTE_PUSH=1`). | Confirmed. |
| Push delivery | FCM topic via React Native Firebase messaging; one send reaches everyone, no per-user tokens stored | Chosen for the step 4 prototype; to be confirmed by device tests before integration. |
| Typography | Garamond everywhere: Cormorant Garamond for titles, names, headers and verse references; EB Garamond for all other text, including scripture, notes, buttons, labels, inputs and tab labels (its true italic for the KJV's supplied words) | Confirmed: one consistent, reverent look. Enforced by lint: screens use `Text`/`TextInput`/`Span` from `app/src/components/ui.tsx`, which apply the font. Only system dialogs (alerts, permission prompts, pickers) stay in the system font. |
| Profile photo and bio | Photo, name and username visible to any signed-in user; bio (max 160 characters) visible to the owner and current mutual friends only. Profile photos may come from the camera or the library. | Confirmed. The photo helps people recognise who they're adding; the bio stays as private as posts. |
| Comments | Added to v1 (originally out of scope). A comment is visible only to current mutual friends of its author who can also see the post; the commenter and the post's author can delete it; no editing. | Confirmed. Nobody's words reach someone who isn't their friend, matching how posts work. |
| Post location | Opt-in per post, off by default. A town-level name only ("Austin, Texas"), never coordinates. Removable when editing, never added or changed later. | Confirmed. Friends see roughly where, not exactly. |
| Night mode | Settings → Appearance: Match phone (default), Light or Dark. Kept on the device. | A display preference, not shared. Colors come from `useColors`/`makeStyles` in `app/src/components/ui.tsx`. |
| Profile page | Its own tab, showing your profile as friends see it, with Edit profile. Settings holds appearance, translation and sign-out. | Confirmed. |
| Answered prayers | The author can later mark a post "answered", with an optional note (up to 1000 characters) on how. Friends see an Answered label and the note. It doesn't add the Edited label, and it can be unmarked. | Requested. Rules: a separate update from editing (`answeredAt` is the server time when first marked). |
| Notifications switch | An on/off switch in Settings (kept on the device). Off means the app stops showing prompts and, once real pushes exist, unsubscribes the phone. If iOS permission was refused, the switch points to the phone's Settings. | iOS doesn't let an app withdraw its own permission. |
| Minimizing friends' posts | Each friend's post in the Today feed can be minimized to one line, or all at once. Remembered only while the app is open. | Nothing about other people's posts is written to the device. |
| Photo download links | Revoked for both people whenever a friendship ends | Storage creates new tokens on read, so they can't be prevented. Revoking them at unfriend is the real guarantee. See `step2-posts-feed.md`. |

## Pending (ask before building)

| Decision | Needed by | Notes |
|---|---|---|
| Bible API provider | Step 3 (licensed translations only) | You're asking providers the seven questions. KJV text can ship without a provider. See `step3-scripture.md`. |
| Moderation approach | Before a public launch | See the trigger points in `step1-auth-friends.md`. Comments add text written to other people, so report and block matter more now. |
