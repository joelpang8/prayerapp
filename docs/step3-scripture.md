# Step 3: scripture

## Decided

- **One verse reference per daily prompt**, the same for everyone. It's carried onto each post; posts don't choose their own verse.
- **A flat, curated list of verses**, maintained by you. No random selection and no themes.
- **KJV by default.** It's public domain, so it ships without a licensed provider. Other translations become opt-in once their licences are clear.
- **Posts store only the reference**, never verse text. The text is looked up when the post is shown, in the viewer's chosen translation.

## Built (doesn't depend on the provider)

### Reference parser and validator: `app/src/lib/scripture/`

- **`parseReference(text)`** reads how people write references:
  - full names and abbreviations: "Philippians 4:6-7", "phil 4.6–7", "1 Jn 1:9", "First John 1:9", "III John 1:2"
  - whole chapters and cross-chapter ranges: "Psalm 23", "John 3:16-4:2"
  - one-chapter books: "Jude 3"

  It checks the reference against **KJV versification**. That data covers 66 books, 1,189 chapters and 31,102 verses, and was generated from CrossWire's KJV data. The tests check those totals and several well-known facts. Anything that doesn't exist, runs backwards, or contains more than one passage is rejected with a readable message.
- **`toRefId` / `parseRefId`** convert to and from the stored form, e.g. `PHP.4.6-7`, `JHN.3.16-4.2`, `PSA.23`. Books use USFM codes, which are the ids Bible APIs use. `parseRefId` is strict: it accepts only the canonical spelling of a passage that exists.
- **`formatReference`** gives the display form ("Philippians 4:6-7", "Psalm 23").
- **`verseCount`** counts the verses in a reference, ready for a licence cap on consecutive verses once we know it.
- **`toApiBiblePassageId`** converts to API.Bible's format. It's included only because it's a pure mapping; no provider has been chosen.

Versification differs slightly between translations: 3 John has 14 verses in the KJV and 15 in some modern translations. When a licensed translation is added, the curated list gets re-checked against it.

### Preferred translation: `users/{uid}/private/settings`

- **Owner-only.** Only you can read or write it; friends and strangers can't. Only the `settings` doc exists there, and even the owner can't list the collection.
- **`bibleVersion` must be on `allowedTranslations()`** in `firestore.rules`, which is `['KJV']` for now. So adding a translation takes a deliberate rules change, made when its licence allows it. A unit test keeps the app's list (`translations.ts`) identical to the rules' list.
- **A missing setting means KJV.**
- Clients can't delete it. It's removed with the account in step 5.
- The Settings screen shows the choice. There is one option until more are licensed.

## Still to build in step 3

1. **Verse on prompts and posts.** The `prompts` docs get `verseRef`, and posts copy it. The rules make sure a post's `verseRef` equals its prompt's, as they already do for `promptFiredAt`, and they check the id format. Rules and tests come in the same change.
2. **Tool for your curated list.** A script you run to check your list: every line parses, gets shown back in canonical form, and duplicates are flagged. It then stores the list for the step 4 scheduler to take verses from.
3. **KJV text source.** Options:
   - (a) bundle the public-domain KJV text in the app, which works offline and needs no provider;
   - (b) serve it from our own Cloud Function;
   - (c) use the provider we pick later.

   (a) is simplest and matches "KJV ships without waiting". It adds a few MB to the app. I'll ask before choosing.
4. **Showing the verse.** It appears under the prompt and on each post, in the viewer's translation, with any copyright notice the licence requires. KJV needs none in most countries. In the UK it is under Crown copyright, so check this if you distribute there.
5. **Licensed translations**, after your provider answers. Most likely through a Cloud Function proxy, so the API key isn't in the app. How much caching and usage reporting is needed depends on the terms.
