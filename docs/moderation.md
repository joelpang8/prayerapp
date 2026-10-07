# Moderation: reports and blocks

## What users can do

- **Report** a person, a prayer or a comment, from the **⋯** menu (on prayer cards, comments and profiles). They pick a reason (Spam, Harassment or bullying, Inappropriate content, Someone may be at risk of harm, Something else), can add a note, and can also block.
- A reported **prayer or comment is hidden for the person who reported it**, straight away and on all their devices (`users/{uid}/hidden/`, readable only by them).
- **Block** someone: the friendship ends at once and neither sees the other's prayers, comments or reactions. It's secret. The blocked person can still "send" a friend request, so nothing looks different to them, but it never appears for the blocker and can't be accepted. The blocker can't send them a request until they unblock (Settings → Blocked people). Unblocking doesn't restore the friendship.

## Reviewing reports (you, the project owner)

Reports are in Firestore, in the **`reports`** collection. No one can read them from the app; you see them in the Firebase console (which uses admin access):

1. console.firebase.google.com → your project → **Firestore Database** → **Data** → `reports`.
2. Each report has:
   - `reporter`, `targetUid`: who reported whom (look up `users/{uid}` for names);
   - `kind`: user, post or comment, with `postId` and `commentId`;
   - `reason`, an optional `note`, and an `excerpt` of the text at the time (kept even if they delete it);
   - `createdAt`.
3. To see the reported prayer itself, open `posts/{postId}` (and `posts/{postId}/comments/{commentId}`). Photos are in **Storage** under `postPhotos/{uid}/`.
4. To act: delete the post or comment in the console (its photo, comments and reactions are cleaned up by the Cloud Functions), or disable the account under **Authentication → Users**.
5. Delete the report document when you've dealt with it.

Reports with reason **"Someone may be at risk of harm"** deserve a prompt look. The app tells the reporter to contact local emergency services if someone is in immediate danger.

Getting an email per report would need an email service and a Cloud Function; that was left out for now (decided).
