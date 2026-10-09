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

## Built: verse on prompts and posts

- **`prompts/{id}.verseRef`** is optional and server-written. It holds a canonical id from the curated list.
- **Posts copy it.** The rules require a post's `verseRef` to equal its prompt's. It must be present exactly when the prompt has one, and it can never be changed by an edit. Text in place of a reference, or an extra `verseText` field, is rejected. Six rules tests cover this, plus an app test showing a post carries its prompt's reference.

## Built: curated list and checker

- **Your list is `firebase/verses/verses.txt`.** It has one reference per line, written however is natural. `#` starts a comment, and the order is the order of use. **It currently holds 10 starter entries (well-known verses on prayer) so the app has something to show. Replace them with your list.**
- **`cd app && npm run verses`** checks the list and writes `firebase/functions/src/verse-list.json`, which the step 4 scheduler will read:
  - **errors:** a reference that can't be read or doesn't exist, the same passage twice (in any spelling), or a passage over a licence cap if you pass `--max-verses N`;
  - **warnings:** passages over 8 verses, and passages that overlap another entry;
  - the output shows every entry with its line number, its canonical form and its verse count.
- **CI runs `npm run verses -- --check`.** It fails if the list has errors or if `verse-list.json` wasn't regenerated after an edit.
- **`npm run dev:prompt`** (emulators only) now attaches the next curated verse, the same way the scheduler will: one per day, in list order. `--verse ID` and `--no-verse` override it.

## Built: KJV text and display

- **The KJV is bundled** in `app/src/lib/scripture/kjv/`, one JSON file per book.
  - Each book loads only when one of its verses is first shown.
  - It adds about 4.4 MB to the app bundle (4.2 MB to 8.6 MB).
  - The source is `es-kjv` (KJV 1769, public domain). It keeps **LORD / GOD** in capitals, as printed, and marks the translators' supplied words, which are shown in *italics* as printed KJVs do.
  - Before choosing it, I compared all 31,102 verses word for word with CrossWire's KJV. They are identical apart from spelling conventions ("Judaea"/"Judea") and one verse, Joshua 19:2, where `es-kjv` has "or Sheba", as the printed KJV does.
  - Tests check the bundled text against the versification table.
  - `npm run generate:kjv` regenerates it.
- **`getPassage(refId, translation)`** turns a stored reference into text *at display time*, in the viewer's own translation. For any translation not yet available, it fails cleanly and the app says "isn't available in your translation".
- **Display:**
  - Today's verse appears under the prompt, and at the top once you've posted.
  - Older posts show their own verse reference; tap it to see the text.
  - Friends' posts don't repeat today's verse when it's already on screen.
  - Passages over 4 verses show the first 4 and a "Show all" link.
- **Settings are read once per session** and shared by every verse on screen.

## Still to do (outside this step)

1. **The step 4 scheduler** writes each day's prompt with the next verse from `verse-list.json`.
2. **Licensed translations**, after the provider answers. They'll come through a Cloud Function proxy, with each translation added to `allowedTranslations()` in the rules and to `translations.ts`, and with any required copyright notice shown next to the verse. `getPassage` is the only place that needs a new branch.
3. **UK distribution:** the KJV is under Crown copyright in the UK. Check this before launching there.

**Read more (added later).** `app/src/app/read/[ref].tsx` shows the whole chapter around a stored reference from the bundled KJV (`getChapter` in `lib/scripture/text.ts`), highlighting the verses the reference covers (`versesInChapter`). It makes no network calls. Tests: `app/tests/unit/readChapter.test.ts`.
