# Production checks (you run these, no key sharing)

`firebase/scripts/verify-production.mjs` answers questions the emulators can't:

| Check | Question | Why it matters |
|---|---|---|
| **B** | How many friends can one feed query cover before the rules' lookup limit refuses it? | This sets `FEED_CHUNK_SIZE` (currently 5). |
| **C** | After an unfriend, is an *open* real-time listener cut off, and is a later post withheld? | Backs up FriendScope's teardown on the phone. |
| **E** | Are private posts hidden from a current friend? A friend's query without the `visibility == "friends"` filter must be refused, the filtered query must leave the private post out, and a direct read of it must be refused. | Confirms the private-post fix in production. The script exits with an error if E fails. **Don't use private posts with real friends until E passes.** |
| **F** | Do the Prayers tab's queries work in production (filters by answered, verse book, exact verse; "On this day"; one month for the calendar and recap; my saved verses, which a friend can't list)? The emulator doesn't check indexes, production does. A friend running the same query on my posts must be refused. | A missing index shows here as `failed-precondition` with a link to create it. |
| **G** | "I'll pray for this": can a friend tap, can the owner see it, is a non-friend refused, can't the owner tap their own, and does the Cloud Function delete the tap after an unfriend? | Confirms the rules and the cleanup function are the deployed ones. |
| **H** | Account deletion: does `deleteAccount` (called as a throwaway user, just signed in) remove their profile, posts, comment, reaction, follow, avatar and sign-in, while another person's post stays? | Confirms the deployed function and its collection-group indexes. The script exits with an error if H fails. |
| **D** | Does revoking a photo's download token on unfriend really kill a saved link? Does reading a photo create a new token? | This is the guarantee from step 2. |

It runs on **your Mac, with your own Google login**. It creates throwaway users (uids starting `zzv`), follows, posts, a prayer request and tap, and one tiny photo. It deletes all of them when it finishes, including after a failure. It prints a JSON report with no secrets in it. Paste that report back to me.

Dry run against the local emulators: `npx firebase emulators:exec --only auth,firestore,storage,functions --project demo-prayerapp "node scripts/verify-production.mjs --emulator"`. I ran this in my environment: the mechanics work, and B to H all produce results. In the emulator, check B showed 10 friends working and 12 refused, and E, F, G and H passed (F's indexes can only be proven in production).

## One-time setup

1. **Blaze plan.** Cloud Functions need the pay-as-you-go plan, and so does Storage on new projects. Usage at this scale is far inside the free allowance. You can set a budget alert under Billing.
2. **Deploy the backend** from `firebase/`:
   ```sh
   npx firebase login
   # firebase/.firebaserc already points at prayerapp-4ce99
   npm --prefix functions install
   npx firebase deploy --only firestore,storage,functions:default
   ```
   `functions:default` deploys the app's functions (thirteen, including the daily prompt's three and `deleteAccount`). This command deploys the Firestore rules and indexes, the Storage rules and those functions. When it asks, let Storage read Firestore; the photo rules need that. Indexes can take a few minutes to build; checks B and F fail with `failed-precondition` until they're ready.
   
   Indexes on `posts` (all in `firebase/firestore.indexes.json`):
   - `authorId, createdAt desc`: my posts by month; the feed.
   - `authorId, visibility, createdAt desc`: the friend feed.
   - `authorId, verseBook, createdAt desc` and `authorId, verseRef, createdAt desc`: Prayers filtered by verse.
   - `authorId, answeredAt desc`: Answered.
   - `authorId, verseBook, answeredAt desc` and `authorId, verseRef, answeredAt desc`: Answered, by verse.
   - `authorId, promptId desc`: the Prayers calendar and "Your month in prayer" (one app month by prompt id).
   - "On this day" (`authorId ==`, `promptId in`) and taps (`friendUid ==`) use Firestore's automatic single-field indexes; check F confirms.
   - Collection-group field overrides on `comments.authorId`, `reactions.authorId` and `prayingFor.friendUid`: account deletion finds a person's comments, reactions and taps everywhere. Check H confirms.
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

5. **After the first deploy of the Prayers filters, backfill older posts** (needs the login from step 3) (once; safe to repeat). From `firebase/`:
   ```sh
   node scripts/backfill-verse-books.mjs --project prayerapp-4ce99         # shows what it would change
   node scripts/backfill-verse-books.mjs --project prayerapp-4ce99 --yes   # does it
   ```
   It adds `verseBook` to posts made before the filter existed and builds each person's verse index. Without it, older posts don't show under a verse filter.

6. **Apple token revocation (for account deletion).** Apple asks apps to revoke the Apple sign-in when an account is deleted. The app does this through Firebase, which needs Apple's code flow set up once: Firebase console → Authentication → Sign-in method → **Apple** → fill in the **OAuth code flow configuration**: Apple Team ID `67F8CKV875`, a **Key ID** and **private key** of a key with "Sign in with Apple" enabled (Apple Developer → Keys → +; it can be a new key, separate from the push key), and a **Services ID** (Apple Developer → Identifiers → Services IDs; any id such as `com.joelpang.praynow.signin`). Without it, deletion still removes everything; the app just logs that revoking failed, and the person can remove PrayAlong under Settings → Apple ID → Sign in with Apple.

## Run

From `firebase/`:

```sh
node scripts/verify-production.mjs \
  --project prayerapp-4ce99 \
  --api-key <apiKey from your Web app config> \
  --service-account firebase-adminsdk-XXXXX@prayerapp-4ce99.iam.gserviceaccount.com
```

Add `--bucket <name>` only if your bucket isn't `prayerapp-4ce99.firebasestorage.app`. The name is shown at the top of the Storage page in the console. It takes about 2–3 minutes, most of it waiting for the unfriend function to run.

## Results: production, run 6fc3f730 (October 2026)

All checks passed against `prayerapp-4ce99` after deploying the rules, indexes and nine functions.

- **E (private posts): pass.** A friend's unfiltered query and direct read are refused; the filtered query leaves the private post out; the author reads it. The private-post fix is confirmed in production.
- **F (Prayers tab): pass.** All seven query shapes work (every index built); a friend running them on someone else's posts is refused.
- **G ("I'll pray for this"): pass.** Friend taps and sees only their own; owner lists; stranger can't tap or read; owner can't tap their own; the tap was deleted by the function right after an unfriend.
- **B (feed limits):** `in` queries work up to 10 friends and are refused at 12. `FEED_CHUNK_SIZE` stays at 5, well inside the limit.
- **C (unfriend, live):** production cuts an open listener off on the unfriend itself (about 50 ms later, no new data needed), and a later post is never delivered. Stronger than the emulator, which only refused on the next change.
- **D (photo links):** no token after upload, none created by reading bytes; a token a friend minted with `getDownloadURL` stopped working 3 seconds after the unfriend (HTTP 403), and the former friend can no longer read the bytes. The step 2 guarantee holds.

Rerun the script after any change to the rules, indexes or functions.

## What I'll do with the report

- **B:** set `FEED_CHUNK_SIZE` to a safe value below the largest working size.
- **C:** confirm, or adjust the docs if production behaves differently from the emulator.
- **F**, **G** and **H:** must say `"pass": true`. A `failed-precondition` in F means an index is still building (wait, then rerun) or missing (tell me).
- **E:** must say `"pass": true`. If it doesn't, stop and send me the report; the rules deployed aren't the ones in this repo.
- **D:** if the link dies after unfriend, the guarantee holds. If it doesn't, we switch photo reads to a different design, such as short-lived signed URLs from a Cloud Function. That's more work, but it closes the gap for certain.
