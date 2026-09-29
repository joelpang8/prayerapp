# Production checks (you run these, no key sharing)

`firebase/scripts/verify-production.mjs` answers three questions the emulators can't:

| Check | Question | Why it matters |
|---|---|---|
| **B** | How many friends can one feed query cover before the rules' lookup limit refuses it? | This sets `FEED_CHUNK_SIZE` (currently 5). |
| **C** | After an unfriend, is an *open* real-time listener cut off, and is a later post withheld? | Backs up FriendScope's teardown on the phone. |
| **D** | Does revoking a photo's download token on unfriend really kill a saved link? Does reading a photo create a new token? | This is the guarantee from step 2. |

It runs on **your Mac, with your own Google login**. It creates throwaway users (uids starting `zzv`), follows, posts and one tiny photo. It deletes all of them when it finishes, including after a failure. It prints a JSON report with no secrets in it. Paste that report back to me.

Dry run against the local emulators: `npx firebase emulators:exec --only auth,firestore,storage,functions --project demo-prayerapp "node scripts/verify-production.mjs --emulator"`. I ran this in my environment: the mechanics work, and B, C and D all produce results. In the emulator, check B showed 10 friends working and 12 refused.

## One-time setup

1. **Blaze plan.** Cloud Functions need the pay-as-you-go plan, and so does Storage on new projects. Usage at this scale is far inside the free allowance. You can set a budget alert under Billing.
2. **Deploy the backend** from `firebase/`:
   ```sh
   npx firebase login
   npx firebase use --add        # choose your project, alias "default"
   npm --prefix functions install
   npx firebase deploy --only firestore,storage,functions
   ```
   This deploys the Firestore rules and the feed index, the Storage rules and the four functions. When it asks, let Storage read Firestore; the photo rules need that. The index can take a few minutes to build, and check B fails with `failed-precondition` until it's ready.
3. **Your login for the script.** Install the gcloud CLI (`brew install --cask google-cloud-sdk`), then:
   ```sh
   gcloud auth application-default login
   gcloud auth application-default set-quota-project <projectId>
   ```
4. **Let your login sign test-user tokens.** The script creates sign-in tokens for its throwaway users, and doing that with your personal login needs one role on the Firebase Admin service account:
   ```sh
   gcloud services enable iamcredentials.googleapis.com --project <projectId>
   gcloud iam service-accounts add-iam-policy-binding \
     firebase-adminsdk-XXXXX@<projectId>.iam.gserviceaccount.com \
     --member="user:<your Google account email>" \
     --role="roles/iam.serviceAccountTokenCreator" --project <projectId>
   ```
   The exact service account email is under Firebase console → Project settings → **Service accounts**. You can remove this role again after the checks.

## Run

From `firebase/`:

```sh
node scripts/verify-production.mjs \
  --project <projectId> \
  --api-key <apiKey from your Web app config> \
  --service-account firebase-adminsdk-XXXXX@<projectId>.iam.gserviceaccount.com
```

Add `--bucket <name>` only if your bucket isn't `<projectId>.firebasestorage.app`; older projects use `.appspot.com`. It takes about 2–3 minutes, most of it waiting for the unfriend function to run.

## What I'll do with the report

- **B:** set `FEED_CHUNK_SIZE` to a safe value below the largest working size.
- **C:** confirm, or adjust the docs if production behaves differently from the emulator.
- **D:** if the link dies after unfriend, the guarantee holds. If it doesn't, we switch photo reads to a different design, such as short-lived signed URLs from a Cloud Function. That's more work, but it closes the gap for certain.
