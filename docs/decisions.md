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
| Reactions | Added (originally out of scope for v1). One preset reaction per person per post: Praying for you, Love, Happy, Amen, Cool, Hugs. Not on your own post. Visible like comments: only to the reactor's current mutual friends who can see the post. | Requested. Same privacy rule as comments, so nobody's reaction reaches a non-friend. |
| Profile details | Birthday (year optional), prayer requests, Bible version, denomination and church, alongside the bio. All optional and friends-only. | Requested. Friends-only like the bio; the year is optional so age needn't be shared. |
| Prayers tab | History renamed **Prayers**, with a month calendar to jump to any day. Tabs: Friends, Prayers, **Today** (middle), Profile, Settings; the app opens on Today. | Requested. |
| Activity | A bell on Today opens **Activity**: friends praying and having prayers answered, and friends' comments and reactions on my prayers, from the last 7 days. The bell shows how many are new. | Requested. Built from data already on the phone (feed, plus comment and reaction threads on my last week's posts), filtered to current friends, memory only; only "last opened" is stored on the device. |
| Landing screen | Signing in or finishing onboarding always opens Today. | Requested. |
| Moderation | **Report** users, prayers and comments (reason + optional note + "also block"); reports go to a write-only `reports` collection reviewed by the project owner in the Firebase console, and a reported prayer or comment is hidden for the reporter. **Block** ends the friendship and is secret: their requests never show and can't be accepted; you can't request them until you unblock (Settings). | Confirmed. Covers App Store Guideline 1.2's report and block. See `docs/moderation.md` for reviewing reports. |
| Private posts | A "Private" switch when posting: that day's prayer is visible only to its author, never in the feed, no comments or reactions. Its photo is stored where only the author can read it. Can't be changed after posting. | Confirmed (not separate journal entries). |
| Offline posting | New posts go through an outbox on the phone and send when the connection is back. The server still decides on time vs late when it arrives; the post shows when the photo was taken. | Confirmed: keeps "late" unfakeable. |
| Invites | "Invite friends" shares a link (`prayerapp://u/username`) and the @username. The link opens their profile with Add friend; opened while signed out, it opens after sign-in. | A web link that works without the app installed needs a website plus Universal Links (paid Apple account): later. |
| Text size | Settings → Text size (Standard / Large / Larger), on top of the phone's own text size, which the app also follows (capped at 1.8× so layouts hold). | Accessibility. |
| Profile tags | 📖 Bible version and ⛪ denomination as tags under the name, from the friends-only details. | Requested. |
| "I'll pray for this" | Prayer requests are **one per line** (up to 10), each with a hidden id. A current mutual friend can tap "I'll pray for this" on each, and tap again to undo; one tap per friend per request; not on your own. **A reworded request gets a new id, so its count starts again**; unchanged lines keep theirs; a removed line's taps are deleted. The owner sees "3 friends are praying for this"; names only if they turn on Settings → Prayer requests → Show who's praying (off by default, kept on the device). Other friends never see who tapped or how many. **No notifications**: nothing is sent, the owner sees the count when they look. The button tells friends "{Name} may see that you're praying" (the owner's app can always tell who tapped, so it doesn't promise anonymity). | Confirmed (DECISIONS 1 and 2, recommended options). Taps live at `users/{owner}/prayingFor/{itemId}_{friend}`; same live friendship check as posts; Cloud Functions delete taps when a friendship ends or a request goes. A daily summary can come after step 4 (push) works on a device. |
| Prayers tab filters | All / Answered, and a verse filter: a picker of the **books I've actually prayed with**, then the exact verses in that book (DECISION 3, recommended option). The picker comes from `users/{me}/private/verseIndex`, kept by a Cloud Function, so the app never reads years of posts to fill it. Filtered lists are all-time, 20 at a time with "Show more"; Answered is sorted by when it was answered. Unfiltered, the tab stays month by month with the calendar. | Confirmed. Posts store `verseBook` (the reference's book code, checked by the rules) so the book filter is a plain indexed query. Only ever my own posts, private ones included. |
| On this day | A card at the top of Prayers with my posts from the same day in earlier years, when there are any. Days are the **app's days** (prompt ids, America/New_York), not the phone's, so travel or clock changes never move a prayer. 29 February posts show on 28 February in years without one. | Confirmed. Uses the post's `promptId`, so it's a lookup by id with no extra field. |
| Prayer helper (ACTS) | "Help me start" under the notes box (compose and edit) offers Praise, Sorry, Thanks and Asking. Tapping one shows its question as a hint that disappears as you type (DECISION 1, option b). Optional, never required. | Confirmed. Nothing is inserted into the notes or stored, so friends never see scaffolding; the post schema, rules and on-time/late label are unchanged. |
| Photo download links | Revoked for both people whenever a friendship ends | Storage creates new tokens on read, so they can't be prevented. Revoking them at unfriend is the real guarantee. See `step2-posts-feed.md`. |

## Pending (ask before building)

| Decision | Needed by | Notes |
|---|---|---|
| Bible API provider | Step 3 (licensed translations only) | You're asking providers the seven questions. KJV text can ship without a provider. See `step3-scripture.md`. |

## Later (needs step 4 and the paid Apple account)

| Idea | Why it waits |
|---|---|
| **Lock-screen countdown** (iOS Live Activity showing the 2-minute window) | Starting one when the prompt arrives, with the app closed, needs push-to-start, so it needs step 4's push and the paid account. The countdown itself runs on the phone (no push per second). |
| **Home-screen widget** with the day's verse | Needs a native widget extension target and an App Group to share data with the app; App Groups aren't available to a free Personal Team. |
| **Web invite links** that work without the app installed | Needs a small website plus Universal Links (Associated Domains), which also needs the paid account. |

