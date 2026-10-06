# Step 2: posts and feed

## Data model

```
prompts/{yyyymmdd}                  one global prompt per day (v1). Server-written only.
  firedAt: timestamp

posts/{promptId}_{authorId}         at most one post per user per prompt
  authorId, promptId
  promptFiredAt: timestamp          must equal the prompt's firedAt (rules)
  createdAt: timestamp              must equal the server time (rules)
  notes: string                     1–2000 chars
  photoPath: string                 postPhotos/{authorId}/{photoId}.jpg
  editedAt?: timestamp              set on every edit, must be the server time (rules)
  place?: string                    1–80 chars, opt-in town name; removable on edit, never added or changed

posts/{postId}/comments/{id}        read: see "Comments" below
  authorId: string                  the commenter; must be the writer
  text: string                      1–500 chars, not just spaces
  createdAt: timestamp              must be the server time. Comments can't be edited.
```

## Location (opt-in)

- Off by default, per post: the **Show where I prayed** switch on the compose screen.
- Only a **town-level name** is stored ("Austin, Texas"). The phone asks for approximate location (iOS defaults to reduced accuracy; Android never gets the precise-location permission), turns it into a name on the device, and drops the coordinates. The rules reject anything but a short string, so coordinates can't be stored.
- The place can be **removed** when editing, but not added or changed later: it records where the post was made.
- Like the rest of the post, only the author and their current friends can see it.

## Comments

**Who sees a comment (decided):** someone who is a *current mutual friend of the commenter* and can see the post (the post's author, or a friend of theirs). The commenter always sees their own. So:

- If Bob and Carol are both friends with Alice but not with each other, they each see Alice's replies, but not each other's comments.
- Unfriending hides comments in both directions straight away, on the server (the rules check the live `follows` docs on every read) and on the phone (`CommentThread` is registered with `FriendScope`).
- Comments on a deleted post are unreadable at once (the rules need the post to exist) and then deleted by `deleteCommentsOfDeletedPost`.

**Who can delete (decided):** the commenter, or the post's author. Nobody can edit a comment.

**On the phone:** a post's comments load only while its page is open (tap **Comments** on a post). The query names the authors it asks for: me plus my friends, in chunks of 5, the same as the feed. Each comment costs the rules a lookup of the post plus two follow lookups for the reader and post author, and two per commenter in the chunk: 13 for a chunk of 5, under the limit. Like the feed's chunk size, this should be confirmed on the real project.

Tests: `firebase/tests/comments.test.js` (rules), `app/tests/comments.test.ts` (the thread against the rules, including unfriending).

## On time vs late

The phone never stores a "late" flag it could fake. The rules pin both timestamps, and the app works out the label from them:

`late = createdAt − promptFiredAt > 7 minutes` (the 2-minute window plus the 5-minute grace period)

This is `isLate()` in `app/src/lib/posts.ts`.

- Editing can't change it, because the timing fields can't be changed.
- As you decided, late is a **label only**. There are no streaks and nothing is counted or compared.
- A prompt stays open for 24 hours. Posting is refused before the prompt fires and after that 24 hours.
- **The clock starts when the post is saved, which is after the photo upload.** A very slow upload near the 7-minute mark could make a post late. Photos are resized to about 1600px (typically 200–400 KB) to keep uploads short.

## Editing and deleting

Both are allowed, as you decided.

- **Editing** can change the notes, the photo, or both. Every edit must set `editedAt` to the server time, so the **Edited** label can't be skipped or backdated.
- **Deleting** is author-only. The photo is deleted by a Cloud Function, not by the phone.

## Cloud Functions (`firebase/functions`)

| Function | Trigger | What it does |
|---|---|---|
| `revokePhotoLinksOnUnfriend` | a `follows` doc is deleted | Revokes the download token on **every photo of both people**. |
| `stripPhotoDownloadTokens` | a photo finishes uploading | Removes the token Storage attaches at upload. |
| `deletePhotoOfDeletedPost` | a post is deleted | Deletes its photo. |
| `deleteReplacedPhoto` | a post's photo changes | Deletes the old photo. |
| `deleteReplacedAvatar` | a profile photo changes or is removed | Deletes the old profile photo. |
| `deleteCommentsOfDeletedPost` | a post is deleted | Deletes its comments. |

### Why revoking at unfriend is the real protection

A download token turns into a URL that works forever for anyone and skips the rules. The app never uses such URLs. But Storage **creates a new token whenever a reader who passes the rules requests a photo that has none**. The emulator's source does this explicitly, and production is believed to match. That means removing the token after upload can't stop a *current* friend's modified client from getting one. What can be guaranteed is that **when the friendship ends, every such link dies**. That's what `revokePhotoLinksOnUnfriend` does.

### What's tested where

- **Delete-photo functions:** end to end in the Functions emulator.
- **Token revocation:** unit tests with a fake bucket. The emulator keeps tokens separately and re-adds them, so revocation can't be observed there.
- **Still to confirm on the real project:** (a) that revoking really stops old links from working, and (b) whether reading a photo creates a new token. `docs/production-checks.md` covers this (check D).

## Feed (`app/src/lib/feed.ts`)

- `FeedStore` is registered with `FriendScope`. When a friendship ends, that friend's posts are dropped and the listener covering them is closed straight away, before the screen redraws. Closing the listener also clears their posts from Firestore's in-memory cache.
- Friends are grouped into chunks of up to **5** per query. Each friend costs the rules 2 lookups, and the rules limit lookups per query. In the emulator, a query covering 10 friends (20 lookups) works and 12 friends is refused, so 5 is well within that. **Production hasn't been checked yet** (see `docs/production-checks.md`). `FEED_CHUNK_SIZE` is the single place to change.
- Chunks keep their members stable, so adding or removing one friend re-subscribes only one chunk.

## App

- **Today tab:** shows the latest prompt ("post by 3:07 pm to be on time", or "it will be marked late"), your post for it with Edit and Delete, and friends' posts.
- **History tab:** your own posts, newest first, with Edit and Delete.
- **Post page:** tap **Comments** on any post to see it with its comments and add one.
- **Compose:** take a photo with the camera and write notes. Development builds also have **Choose photo (development)**, because the Simulator has no camera.
- **Photos** are shown from memory (`cachePolicy="none"`), never from expo-image's disk cache.

**Camera only** for real users (decided). The library picker is compiled only into development builds.

## Trying it in the Simulator

1. `cd firebase && npm run emulators`
2. `cd firebase && npm run dev:prompt` sends a prompt now. `npm run dev:prompt -- --minutes-ago 10` sends one that already fired, so your post will be late. This script only runs against the emulators. Real prompts come from the step 4 scheduler.
3. In the app: Today, then **Pray now**, then choose a photo (development), write notes, and **Post**.
