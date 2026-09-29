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

## Pending (ask before building)

| Decision | Needed by | Notes |
|---|---|---|
| Frontend framework | Now, before `app/` is created | Recommendation: React Native + Expo (TypeScript). See the step 1 reply. |
| Sign-in providers | Step 1 client | Recommendation: Sign in with Apple + Google. If Google sign-in is offered on iOS, App Store rules require Apple sign-in too. The rules don't depend on the provider. |
| Is "late" purely descriptive, or does it carry social weight (streaks, visible to friends)? | Step 2 post schema | |
| Can posts be edited or deleted after posting? | Step 2 post rules | Until decided, post writes are **denied** in the rules. This is deliberate, not a stub. |
| Global prompt time vs. per-user time | Step 4 architecture | These are two different designs, not a toggle. |
| Bible API provider | Step 3 | Check the license first: automated or notification-style display allowed? Limit on consecutive verses? |
| Moderation approach | Before a public launch | See the trigger points in `step1-auth-friends.md`. |
