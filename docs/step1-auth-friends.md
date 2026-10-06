# Step 1: auth, friends, security rules

## Data model

```
users/{uid}                         public profile. get: any signed-in user. list: no one
  username: string                  unique, lowercase, can't be changed
  displayName: string               1–50 chars, owner can edit
  avatarPath?: string               avatars/{uid}/{id}.jpg, owner can set or remove
  createdAt: timestamp              must be the server time

users/{uid}/friendsOnly/about       get: the owner and their current mutual friends. list/delete: no one
  bio: string                       0–160 chars, owner writes
  birthday?: string                 "MM-DD" or "YYYY-MM-DD" (the year is optional)
  prayerRequests?: string           1–500 chars
  bibleVersion?: string             1–40 chars (what they read; separate from the app's display setting)
  denomination?: string             1–60 chars
  church?: string                   1–80 chars

Storage avatars/{uid}/{id}.jpg      profile photo. get: any signed-in user.
                                    write: owner only, JPEG under 2 MB. list: no one

usernames/{username}                exact-match lookup for "add friend by username"
  uid: string                       get: any signed-in user. list: no one

follows/{followerId}_{followeeId}   one-way follow edge. Can't be edited.
  followerId, followeeId: string    only these two users can read or delete it
  createdAt: timestamp

posts/{postId}                      read: the author and the author's current mutual friends
  authorId: string                  writes: denied until step 2
  ...                               step 2 defines the rest
```

**Profile photo and bio (added later).** The photo is public to signed-in users, like the name, so people can recognise each other when adding friends. The bio is friends-only and uses the same live `follows` check as posts, in its own doc so the public profile never carries it. When the photo changes, the `deleteReplacedAvatar` function deletes the old file, and its download token is stripped on upload like post photos. In the app, profile photos load with `getBytes` into a memory-only cache (cleared on sign-out); the profile screen stops its bio listener and drops the text as soon as the friend graph says the friendship ended. Tests: `firebase/tests/profile-extras.test.js` and `app/tests/profile.test.ts`.

**Friend states**, from the point of view of user A and user B:

| Docs that exist | Meaning | Who can see A's posts |
|---|---|---|
| none | strangers | only A |
| `A_B` | A sent a request to B (B sees it in their incoming list) | only A |
| `A_B` + `B_A` | friends | A and B |

Client actions:

- **Send a request:** create `me_them`.
- **Accept a request:** create `me_them` when `them_me` already exists.
- **Decline or cancel a request:** delete the edge.
- **Remove a friend:** delete **both** edges in one batch. Otherwise the leftover edge becomes a pending request that could be accepted by mistake later.

## Guarantees the rules enforce (each one is a test)

Tests are in `firebase/tests/*.test.js`: 54 cases in total.

- Only a signed-in user who isn't anonymous can read anything.
- A user can create only their own profile, and must claim a free username in the same batch. They get exactly one username. Timestamps must come from the server. Unknown fields are rejected.
- Profiles and usernames can be read one at a time but can't be listed, so the user base can't be enumerated.
- Nobody can create a follow edge on someone else's behalf. This is what would let someone forge a friendship. The doc id must match its fields. Self-follows and follows to users who don't exist are rejected. Edges can't be edited.
- A follow edge can be read or deleted only by the two people involved. A third party can't find out who follows whom.
- **Post reads:** allowed only for the author, or when *both* follow edges exist *at the time of the read*. That means:
  - a pending request (one-way follow) grants nothing, in either direction.
  - friendship doesn't carry over: a friend of a friend sees nothing.
  - after either side deletes either edge, single reads and queries fail right away.
  - a removed friend who re-follows is back to "pending" and sees nothing.
  - an **open real-time listener** fails with `permission-denied` on its next result change. The post that triggered that change is **not** delivered.
  - a query not constrained to authors the reader can see is rejected. For example, "all posts" is rejected, and so is an `in` query that includes one non-friend.
  - reading a post id that doesn't exist looks exactly like reading one you're not allowed to see.

## Cached visibility: what the rules can't do, and where the app handles it

The rules control what the **server** gives out. Anything a removed friend's device *already received* is the app's job to drop. That code is below, with the tests that check it.

| What | Where | Tested by |
|---|---|---|
| **Firestore cache is memory-only with eager garbage collection.** Nothing from Firestore is written to disk. A document leaves the in-memory cache as soon as no listener covers it. | `app/src/lib/firestoreSettings.ts`, used by `app/src/firebase.ts` | `app/tests/cachedVisibility.test.ts`: a friend's post is in the cache while the listener is open and gone once it's torn down. Runs the app's real settings against the emulator. |
| **FriendScope**: the one place that knows who my friends are. It watches both directions of my follow edges from the server, ignoring cached snapshots. When someone leaves the friend set, it calls `evictAuthor(uid)` on every registered cache *before* the UI re-renders. `stop()` on sign-out clears everything. | `app/src/lib/friendScope.ts`, created per user in `app/src/session/SessionProvider.tsx` | `app/tests/unit/friendScope.test.ts`, plus an end-to-end test in `app/tests/cachedVisibility.test.ts` (alice removes bob, and bob's device drops alice's photos). |
| **PhotoCache**: decoded photos held in memory only, as data URIs. Registered with FriendScope. A download that is still in flight when the friend is removed (or at sign-out) is thrown away, not shown. After an eviction, the next request goes back to the server, so the rules are checked again. | `app/src/lib/photoCache.ts` | `app/tests/unit/photoCache.test.ts` |
| **Photos go through the Storage rules on every fetch.** `storageLoader` uses `getBytes`, never `getDownloadURL`. | `app/src/lib/photoCache.ts` | `app/tests/photoLoader.test.ts` (author gets it, stranger is refused, friend is refused right after removal), and `app/tests/unit/noDownloadUrls.test.ts`, which fails if any app code calls `getDownloadURL`. |

The step 2 feed (`app/src/lib/feed.ts`) is registered with FriendScope. `evictAuthor` closes that friend's listener and drops their posts from the feed.

**Photo download tokens:** these are handled by Cloud Functions in step 2. When a friendship ends, every download link to either person's photos is revoked. See `docs/step2-posts-feed.md` for why revoking at unfriend, rather than only after upload, is the guarantee that matters.

## Known limits to confirm in step 2

- **Rules lookup cap on feed queries.** Each friend in an `in` query costs 2 `exists()` lookups. Production allows 10 such lookups for a query request (20 for multi-document operations). The emulator passed a 2-friend `in` query but is not a reliable judge of these caps. Plan: split the feed into `in` queries of at most 5 authors, or run one query per friend. Check this against a real (non-demo) Firebase project before building the feed on it.
- **Listener cut-off in production.** The listener behaviour above is tested in the emulator. It will be re-checked once against a real project in step 2. FriendScope's client-side teardown doesn't rely on it either way.
- **Storage emulator behind a proxy.** Storage rules that call `firestore.exists()` fail in the emulator when `HTTPS_PROXY` is set, because firebase-tools ignores `NO_PROXY` for its own localhost calls. This only affects proxied sandboxes. CI and a normal Mac are fine, and CI runs these tests.

## Moderation trigger points (flagging early, per the brief)

Moderation is deferred, but these are the points where it stops being optional:

- **Follow-request spam or harassment.** Anyone who knows a username can send requests without limit, and there is no **block** yet. Declining just deletes the edge, and the sender can send again. A block list and rate limit (probably a Cloud Function) are needed before strangers can find each other.
- **Profile photos are visible to strangers.** Anyone signed in who knows a username can see that person's photo. That widens the reporting need below beyond friends.
- **Photo content.** Once photos exist (step 2), there is no reporting path. Friends-only visibility lowers the risk but doesn't remove it. App Store Guideline 1.2 requires a way to report and block for user-generated content, so this is a **launch blocker for the App Store**, not just nice to have.

## Step 1 app (built)

- **Sign-in:** Apple (with a nonce, as Firebase requires) and Google, in `app/src/auth/signIn.ts`. In emulator mode there is also a development sign-in that uses the Auth emulator's fake Google token. Its provider is still `google.com`, so the same rules apply.
- **Onboarding:** name and username, written in one batch. A taken username gets a clear message. `app/src/app/onboarding.tsx`
- **Friends tab:** find by exact username, send a request, see incoming requests (with a badge on the tab), accept or decline, cancel sent requests, and remove friends (with a confirmation). `app/src/app/(tabs)/friends.tsx`
- **Profile tab:** your profile as friends see it, with **Edit profile** (photo from camera or library, 160-character bio).
- **Settings tab:** appearance (night mode), Bible translation and sign-out.
- **Other people's profiles** (`app/src/app/profile/[uid].tsx`): opened by tapping a name on a post, a comment or in Friends. Shows photo, name, username, and the bio to friends only. Sign-out stops FriendScope, which clears every friend-scoped cache.
- The Today tab is empty until step 2.

Checked here: type-check, lint, an iOS JavaScript bundle build, and 31 data-layer tests (22 unit, 9 against the emulators). **Not checked yet: running on a device or simulator.** This environment is Linux, with no Xcode. See `docs/ios-device-build.md`.
