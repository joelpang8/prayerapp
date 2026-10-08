# Project rules

- **Closed-source and private.** Never add a LICENSE, COPYING or similar file, including ones that come with templates (Expo, create-* tools). Every `package.json` has `"license": "UNLICENSED"` and `"private": true`. CI enforces this in `.github/scripts/check-no-license.sh`.
- **Security rules are core code.** Any change to `firebase/firestore.rules` or `firebase/storage.rules` comes with emulator tests in `firebase/tests/`, in the same change. Never stub a rule "to fill in later". Deny until the real rule is written and tested.
- **Post visibility:** only the author and their *current* mutual friends. The check reads the live `follows` docs. Never replace it with a copied friend list.
- **Comment and reaction visibility:** a comment or reaction is readable only by its author and by people who are *current* mutual friends of its author and can see the post. Same live `follows` check; never widen it.
- **Private posts** (`visibility: "private"`) are readable only by their author; their photos live in `privatePhotos/`, author-only. Friends' post queries must filter `visibility == "friends"`, and the read rule must stay an exact equality: a lenient `.get('visibility', 'friends')` let an unfiltered query return private posts in the emulator.
- **"I'll pray for this" taps** (`users/{owner}/prayingFor/{itemId}_{friend}`): only a *current* mutual friend can tap (same live `follows` check), never on their own requests, and only on an id in the owner's current `requestIds`. Only the owner can list taps; a friend can read only their own; nobody else, ever. Never send the owner anything about taps unless they opt in. Counts in the app include only current friends on current requests. Rewording a request gives it a new id.
- **Prayers tab** queries are always `authorId == me` (private posts included) and must never include a friend's content. New query shapes need an index in `firebase/firestore.indexes.json` and a line in production check F.
- **Blocks are secret:** never show the blocked person anything that reveals the block. Reports are write-only for clients.
- **Location:** posts store only an opt-in town-level place name, never coordinates.
- **Never call `getDownloadURL()`** on post photos. Load them with `getBytes` through `app/src/lib/photoCache.ts`. A unit test fails if app code calls it.
- **Anything holding other people's content on the device** must register with `FriendScope` (`app/src/lib/friendScope.ts`) and implement `evictAuthor`/`clear`. It stays memory-only, never written to disk.
- **Scripture:** posts store only a verse *reference* (and its book code, `verseBook`), never the verse text.
- **Days** for "On this day" are the app's days (prompt ids, America/New_York), never the phone's local date.
- **Build order and open decisions** are in `README.md` and `docs/decisions.md`. Ask before building anything that depends on an open decision.
- **Step 4 prototype stays isolated.** `firebase/notify-proto/` and `prototypes/notify-app/` must not be imported by `app/` or `firebase/functions/` until it's proven on devices. Deploy the app with `functions:default`.
- **Theme:** colors come from `useColors()` / `makeStyles()` in `app/src/components/ui.tsx` (light and dark). Don't hard-code colors. Text and inputs use `Text`/`TextInput`/`Span` from there (lint enforces it).
- **Expo SDK 57.** Check APIs against the installed packages' types, not memory. Use `npx expo install` to add packages.
