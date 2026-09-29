# Prayer app

A daily, randomly-timed prompt to pray right now. Users reply with a photo and notes, and only mutual friends can see what they post.

## Layout

```
prayerapp/
├── firebase/                 Backend (the only part built so far)
│   ├── firestore.rules       Security rules: the privacy boundary
│   ├── firestore.indexes.json
│   ├── firebase.json         Emulator config (demo project, no cloud needed)
│   └── tests/                Rules tests, run against the Firestore emulator
├── app/                      (not created yet) React Native + Expo client
├── docs/
│   ├── decisions.md          Open and settled product decisions
│   └── step1-auth-friends.md Data model and security model for step 1
└── .github/workflows/        CI: runs the rules tests on every push
```

Cloud Functions (`firebase/functions/`) and Storage rules (`firebase/storage.rules`) will be added in the steps that need them.

## Running the rules tests

You need Node 20+ and Java 11+. On a Mac: `brew install node openjdk`.

```sh
cd firebase
npm install
npm test        # starts the Firestore emulator, runs vitest, shuts it down
```

The project id `demo-prayerapp` makes the emulator run fully offline. No Firebase project or login is needed for the tests.

## Build order

1. Auth and mutual-follow friends, with tested security rules. **(in progress: rules done, client pending framework confirmation)**
2. Posts and feed: photo and notes, on-time/late flag, personal history, friend feed.
3. Scripture: store only the verse reference, and render it in each viewer's chosen version.
4. Notifications and countdown: prototyped on its own first.
5. Account deletion and data export.
