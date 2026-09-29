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
| Photo download links | Revoked for both people whenever a friendship ends | Storage creates new tokens on read, so they can't be prevented. Revoking them at unfriend is the real guarantee. See `step2-posts-feed.md`. |

## Pending (ask before building)

| Decision | Needed by | Notes |
|---|---|---|
| Bible API provider | Step 3 | Check the license first: automated or notification-style display allowed? Limit on consecutive verses? Research not started. |
| Moderation approach | Before a public launch | See the trigger points in `step1-auth-friends.md`. |
