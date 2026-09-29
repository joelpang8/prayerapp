# Prayer app

A daily, randomly-timed prompt to pray right now. Users reply with a photo and notes, and only mutual friends can see what they post.

## Layout

```
prayerapp/
├── firebase/                 Backend
│   ├── firestore.rules       Security rules for Firestore: the privacy boundary
│   ├── storage.rules         Security rules for post photos (same friendship check)
│   ├── firebase.json         Emulator config (demo project, no cloud needed)
│   └── tests/                Rules tests, run against the emulators
├── app/                      React Native + Expo (TypeScript) client
│   ├── src/app/              Screens (Expo Router)
│   ├── src/lib/              Data layer: profiles, friends, FriendScope, PhotoCache
│   ├── src/auth/             Apple / Google sign-in
│   ├── src/session/          Signed-in session: wires FriendScope and caches to the UI
│   └── tests/                Data-layer tests (unit + against the emulators)
├── docs/
│   ├── decisions.md          Settled and open decisions
│   ├── step1-auth-friends.md Data model, security model, cached visibility
│   └── ios-device-build.md   Running on the Simulator or your iPhone
└── .github/workflows/ci.yml  Rules tests + app type-check, lint and tests on every push
```

## Tests

You need Node 22 and Java 11+. On a Mac: `brew install node@22 openjdk`.

```sh
cd firebase && npm install && npm test   # 74 security-rules tests
cd ../app && npm install && npm test     # 31 data-layer tests (needs ../firebase installed)
npm run typecheck && npm run lint
```

In a sandbox that routes traffic through an HTTPS proxy, set `SKIP_CROSS_SERVICE=1`. It skips the three photo tests where the Storage rules check Firestore (see the known limits in `docs/step1-auth-friends.md`). CI always runs them.

## Build order

1. Auth and mutual-follow friends, with tested security rules. **(done in code; still needs a run on a real device)**
2. Posts and feed: photo and notes, on-time/late flag, personal history, friend feed. **(photo Storage rules done)**
3. Scripture: store only the verse reference, and render it in each viewer's chosen version.
4. Notifications and countdown: prototyped on its own first.
5. Account deletion and data export.
