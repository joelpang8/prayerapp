# Project rules

- **Closed-source and private.** Never add a LICENSE, COPYING or similar file, including ones that come with templates (Expo, create-* tools). Every `package.json` has `"license": "UNLICENSED"` and `"private": true`. CI enforces this in `.github/scripts/check-no-license.sh`.
- **Security rules are core code.** Any change to `firebase/firestore.rules` or `firebase/storage.rules` comes with emulator tests in `firebase/tests/`, in the same change. Never stub a rule "to fill in later". Deny until the real rule is written and tested.
- **Post visibility:** only the author and their *current* mutual friends. The check reads the live `follows` docs. Never replace it with a copied friend list.
- **Comment visibility:** a comment is readable only by its author and by people who are *current* mutual friends of its author and can see the post. Same live `follows` check; never widen it.
- **Location:** posts store only an opt-in town-level place name, never coordinates.
- **Never call `getDownloadURL()`** on post photos. Load them with `getBytes` through `app/src/lib/photoCache.ts`. A unit test fails if app code calls it.
- **Anything holding other people's content on the device** must register with `FriendScope` (`app/src/lib/friendScope.ts`) and implement `evictAuthor`/`clear`. It stays memory-only, never written to disk.
- **Scripture:** posts store only a verse *reference*, never the verse text.
- **Build order and open decisions** are in `README.md` and `docs/decisions.md`. Ask before building anything that depends on an open decision.
- **Step 4 prototype stays isolated.** `firebase/notify-proto/` and `prototypes/notify-app/` must not be imported by `app/` or `firebase/functions/` until it's proven on devices. Deploy the app with `functions:default`.
- **Theme:** colors come from `useColors()` / `makeStyles()` in `app/src/components/ui.tsx` (light and dark). Don't hard-code colors. Text and inputs use `Text`/`TextInput`/`Span` from there (lint enforces it).
- **Expo SDK 57.** Check APIs against the installed packages' types, not memory. Use `npx expo install` to add packages.
