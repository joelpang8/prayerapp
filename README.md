# Prayer app

A daily, randomly-timed prompt to pray right now. Users reply with a photo and notes, and only mutual friends can see what they post.

Private, closed-source project. There is no license, and none should be added (see `CLAUDE.md`).

## Layout

```
prayerapp/
├── firebase/                 Backend
│   ├── firestore.rules       Security rules for Firestore: the privacy boundary
│   ├── storage.rules         Security rules for post photos (same friendship check)
│   ├── functions/            Cloud Functions: photo-link revocation, photo cleanup
│   ├── scripts/              fire-prompt.mjs, schedule-prompt.mjs, verify-production.mjs, backfill-verse-books.mjs
│   ├── verses/verses.txt     Your curated daily verse list (check with: cd app && npm run verses)
│   ├── firebase.json         Emulator config (demo project, no cloud needed)
│   └── tests/                Rules + functions tests, run against the emulators
├── app/                      React Native + Expo (TypeScript) client
│   ├── src/app/              Screens (Expo Router)
│   ├── src/lib/              Data layer: profiles, friends, posts, feed, FriendScope, PhotoCache
│   ├── src/lib/scripture/    Verse-reference parser, KJV versification, translations
│   ├── src/auth/             Apple / Google sign-in
│   ├── src/session/          Signed-in session: wires FriendScope and caches to the UI
│   └── tests/                Data-layer tests (unit + against the emulators)
├── docs/
│   ├── decisions.md          Settled and open decisions
│   ├── step1-auth-friends.md Data model, security model, cached visibility
│   ├── step2-posts-feed.md   Posts, on-time/late, feed, Cloud Functions
│   ├── step3-scripture.md    Verse references, translation setting, what's left
│   ├── step4-notifications.md Push/countdown prototype: design, results so far, test plan
│   ├── production-checks.md  Checks you run on the real project (limits, listener, photo links)
│   ├── credits.md            Where third-party data came from (KJV text, versification)
│   └── ios-device-build.md   Running on the Simulator or your iPhone
└── .github/workflows/ci.yml  Rules tests + app type-check, lint and tests on every push
```

## Updating the app

From new code to phones (Simulator, your phone, TestFlight): `docs/updating.md`.

## Tests

You need Node 22 and Java 11+. On a Mac: `brew install node@22 openjdk`.

```sh
cd firebase && npm install && npm --prefix functions install
npm test                                 # rules + Cloud Functions tests
cd ../app && npm install && npm test     # data-layer tests (needs ../firebase installed)
npm run typecheck && npm run lint
```

In a sandbox that routes traffic through an HTTPS proxy, use `npm run test:sandbox` in `firebase/`, and `SKIP_CROSS_SERVICE=1 npm test` in `app/`. It skips the tests that need one emulator to call another: photo reads that check Firestore, and Functions triggers. firebase-tools sends its own localhost calls through the proxy. CI always runs them.

## Build order

1. Auth and mutual-follow friends, with tested security rules. **(done; running on an iPhone against production)**
2. Posts and feed: photo and notes, on-time/late flag, personal history, friend feed. **(done; deployed and verified in production, including private posts: see `docs/production-checks.md`; running on an iPhone)**
3. Scripture: store only the verse reference, and render it in each viewer's chosen version. **(done: references, KJV text, curated list, per-viewer display, Read more and Listen; running on an iPhone)**
4. Notifications and countdown: prototyped on its own first. **(done: proven on an iPhone, then integrated; the daily random prompt and push run in production and reached a phone. The prototype has been removed.)**
5. Account deletion and data export. **(next; required for the App Store.)** Must also remove the profile photo (`avatars/{uid}/`), bio (`users/{uid}/friendsOnly/about`), the user's comments and reactions on other people's posts, their "I'll pray for this" taps (`users/*/prayingFor/*_{uid}`, plus their own `prayingFor`) and `users/{uid}/private/verseIndex`.
