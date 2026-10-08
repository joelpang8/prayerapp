# Production checks (you run these, no key sharing)

`firebase/scripts/verify-production.mjs` answers questions the emulators can't:

| Check | Question | Why it matters |
|---|---|---|
| **B** | How many friends can one feed query cover before the rules' lookup limit refuses it? | This sets `FEED_CHUNK_SIZE` (currently 5). |
| **C** | After an unfriend, is an *open* real-time listener cut off, and is a later post withheld? | Backs up FriendScope's teardown on the phone. |
| **E** | Are private posts hidden from a current friend? A friend's query without the `visibility == "friends"` filter must be refused, the filtered query must leave the private post out, and a direct read of it must be refused. | Confirms the private-post fix in production. The script exits with an error if E fails. **Don't use private posts with real friends until E passes.** |
| **F** | Do the Prayers tab's queries work in production (filters by answered, verse book, exact verse; "On this day")? The emulator doesn't check indexes, production does. A friend running the same query on my posts must be refused. | A missing index shows here as `failed-precondition` with a link to create it. |
| **G** | "I'll pray for this": can a friend tap, can the owner see it, is a non-friend refused, can't the owner tap their own, and does the Cloud Function delete the tap after an unfriend? | Confirms the rules and the cleanup function are the deployed ones. |
| **D** | Does revoking a photo's download token on unfriend really kill a saved link? Does reading a photo create a new token? | This is the guarantee from step 2. |

It runs on **your Mac, with your own Google login**. It creates throwaway users (uids starting `zzv`), follows, posts, a prayer request and tap, and one tiny photo. It deletes all of them when it finishes, including after a failure. It prints a JSON report with no secrets in it. Paste that report back to me.

Dry run against the local emulators: `npx firebase emulators:exec --only auth,firestore,storage,functions --project demo-prayerapp "node scripts/verify-production.mjs --emulator"`. I ran this in my environment: the mechanics work, and B to G all produce results. In the emulator, check B showed 10 friends working and 12 refused, and E, F and G passed (F's indexes can only be proven in production).

## One-time setup

1. **Blaze plan.** Cloud Functions need the pay-as-you-go plan, and so does Storage on new projects. Usage at this scale is far inside the free allowance. You can set a budget alert under Billing.
2. **Deploy the backend** from `firebase/`:
   ```sh
   npx firebase login
   # firebase/.firebaserc already points at prayerapp-4ce99
   npm --prefix functions install
   npx firebase deploy --only firestore,storage,functions:default
   ```
   `functions:default` deploys only the app's nine functions. The step 4 push prototype is a separate codebase, `notify-proto`, and is deployed on its own when you test it (see `step4-notifications.md`). This command deploys the Firestore rules and indexes, the Storage rules and those nine functions. When it asks, let Storage read Firestore; the photo rules need that. Indexes can take a few minutes to build; checks B and F fail with `failed-precondition` until they're ready.
   
   Indexes on `posts` (all in `firebase/firestore.indexes.json`):
   - `authorId, createdAt desc`: my posts by month; the feed.
   - `authorId, visibility, createdAt desc`: the friend feed.
   - `authorId, verseBook, createdAt desc` and `authorId, verseRef, createdAt desc`: Prayers filtered by verse.
   - `authorId, answeredAt desc`: Answered.
   - `authorId, verseBook, answeredAt desc` and `authorId, verseRef, answeredAt desc`: Answered, by verse.
   - "On this day" (`authorId ==`, `promptId in`) and taps (`friendUid ==`) use Firestore's automatic single-field indexes; check F confirms.
5. **After the first deploy of the Prayers filters, backfill older posts** (once; safe to repeat). From `firebase/`:
   ```sh
   node scripts/backfill-verse-books.mjs --project prayerapp-4ce99         # shows what it would change
   node scripts/backfill-verse-books.mjs --project prayerapp-4ce99 --yes   # does it
   ```
   It adds `verseBook` to posts made before the filter existed and builds each person's verse index. Without it, older posts don't show under a verse filter.
3. **Your login for the script.** Install the gcloud CLI (`brew install --cask google-cloud-sdk`), then:
   ```sh
   gcloud auth application-default login
   gcloud auth application-default set-quota-project prayerapp-4ce99
   ```
4. **Let your login sign test-user tokens.** The script creates sign-in tokens for its throwaway users, and doing that with your personal login needs one role on the Firebase Admin service account:
   ```sh
   gcloud services enable iamcredentials.googleapis.com --project prayerapp-4ce99
   gcloud iam service-accounts add-iam-policy-binding \
     firebase-adminsdk-XXXXX@prayerapp-4ce99.iam.gserviceaccount.com \
     --member="user:<your Google account email>" \
     --role="roles/iam.serviceAccountTokenCreator" --project prayerapp-4ce99
   ```
   The exact service account email is under Firebase console → Project settings → **Service accounts**. You can remove this role again after the checks.

## Run

From `firebase/`:

```sh
node scripts/verify-production.mjs \
  --project prayerapp-4ce99 \
  --api-key <apiKey from your Web app config> \
  --service-account firebase-adminsdk-XXXXX@prayerapp-4ce99.iam.gserviceaccount.com
```

Add `--bucket <name>` only if your bucket isn't `prayerapp-4ce99.firebasestorage.app`. The name is shown at the top of the Storage page in the console. It takes about 2–3 minutes, most of it waiting for the unfriend function to run.

## What I'll do with the report

- **B:** set `FEED_CHUNK_SIZE` to a safe value below the largest working size.
- **C:** confirm, or adjust the docs if production behaves differently from the emulator.
- **F** and **G:** must say `"pass": true`. A `failed-precondition` in F means an index is still building (wait, then rerun) or missing (tell me).
- **E:** must say `"pass": true`. If it doesn't, stop and send me the report; the rules deployed aren't the ones in this repo.
- **D:** if the link dies after unfriend, the guarantee holds. If it doesn't, we switch photo reads to a different design, such as short-lived signed URLs from a Cloud Function. That's more work, but it closes the gap for certain.
