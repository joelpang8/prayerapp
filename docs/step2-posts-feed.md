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
```

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
- **Compose:** take a photo with the camera and write notes. Development builds also have **Choose photo (development)**, because the Simulator has no camera.
- **Photos** are shown from memory (`cachePolicy="none"`), never from expo-image's disk cache.

**Camera only** for real users (decided). The library picker is compiled only into development builds.

## Trying it in the Simulator

1. `cd firebase && npm run emulators`
2. `cd firebase && npm run dev:prompt` sends a prompt now. `npm run dev:prompt -- --minutes-ago 10` sends one that already fired, so your post will be late. This script only runs against the emulators. Real prompts come from the step 4 scheduler.
3. In the app: Today, then **Pray now**, then choose a photo (development), write notes, and **Post**.
