# Step 1: auth, friends, security rules

## Data model

```
users/{uid}                         public profile. get: any signed-in user. list: no one
  username: string                  unique, lowercase, can't be changed
  displayName: string               1–50 chars, owner can edit
  createdAt: timestamp              must be the server time

usernames/{username}                exact-match lookup for "add friend by username"
  uid: string                       get: any signed-in user. list: no one

follows/{followerId}_{followeeId}   one-way follow edge. Can't be edited.
  followerId, followeeId: string    only these two users can read or delete it
  createdAt: timestamp

posts/{postId}                      read: the author and the author's current mutual friends
  authorId: string                  writes: denied until step 2
  ...                               step 2 defines the rest
```

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

## Cached visibility: what the rules can't do, and what the client must do

The rules control what the **server** gives out. Anything the removed friend's device *already received* stays on that device unless the app deletes it. Here is how each gap is covered:

1. **Local Firestore cache.** The app will use the memory-only cache (`memoryLocalCache`), not disk persistence, for other people's posts. Nothing someone else prayed about is written to disk on a friend's phone. Your own history can still use a persistent cache.
2. **Listener behaviour.** The app keeps a listener on its own follow edges. When a friendship ends, it closes the feed listeners for that friend and removes their posts from memory at once. It does not wait for the next server change. The server cut-off (tested above) is the backstop for a modified client.
3. **Photos (step 2, important).** Firebase Storage `getDownloadURL()` URLs are permanent links that anyone holding them can open, and they stay valid after unfriending. **The app must not use them for post photos.** Storage rules will run the same mutual-follow check with `firestore.exists()`, and the client will fetch photos through the SDK so the rules are checked on every fetch. Those Storage rules get their own emulator tests in step 2.
4. **Thumbnails and OS caches.** The image cache will be memory-only for friends' photos.

## Known limits to confirm in step 2

- **Rules lookup cap on feed queries.** Each friend in an `in` query costs 2 `exists()` lookups. Production allows 10 such lookups for a query request (20 for multi-document operations). The emulator passed a 2-friend `in` query but is not a reliable judge of these caps. Plan: split the feed into `in` queries of at most 5 authors, or run one query per friend. Check this against a real (non-demo) Firebase project before building the feed on it.
- **Listener cut-off in production.** The listener behaviour above is tested in the emulator. It will be re-checked once against a real project in step 2, and the client-side teardown (point 2) doesn't rely on it either way.

## Moderation trigger points (flagging early, per the brief)

Moderation is deferred, but these are the points where it stops being optional:

- **Follow-request spam or harassment.** Anyone who knows a username can send requests without limit, and there is no **block** yet. Declining just deletes the edge, and the sender can send again. A block list and rate limit (probably a Cloud Function) are needed before strangers can find each other.
- **Photo content.** Once photos exist (step 2), there is no reporting path. Friends-only visibility lowers the risk but doesn't remove it. App Store Guideline 1.2 requires a way to report and block for user-generated content, so this is a **launch blocker for the App Store**, not just nice to have.

## Not built yet in step 1 (waiting on framework confirmation)

- Client sign-in UI (Apple/Google), the sign-up screen that writes the profile + username batch, the user search screen, the requests inbox, and the friends list with remove.
