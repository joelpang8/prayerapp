// Production checks the emulators can't answer. Run by the project owner on
// their own machine with their own Google login; no key is shared.
//
//   node scripts/verify-production.mjs \
//     --project <projectId> --api-key <web API key> \
//     --bucket <projectId>.firebasestorage.app \
//     --service-account <firebase-adminsdk-...@<projectId>.iam.gserviceaccount.com>
//
//   node scripts/verify-production.mjs --emulator   # dry run against local emulators
//
// See docs/production-checks.md for setup (login, one IAM role, deploy).
//
// It creates throwaway users (uids starting "zzv"), follows, posts, a prayer
// request and tap, and one photo, runs the checks, and deletes everything it created, even on failure.
// The report contains no secrets; paste it back as-is.

import { randomBytes } from "node:crypto";
import { applicationDefault, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getStorage as adminStorage } from "firebase-admin/storage";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, initializeFirestore,
  limit, memoryLocalCache, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import {
  connectStorageEmulator, getBytes, getDownloadURL, getStorage, ref, uploadBytes,
} from "firebase/storage";

// ---------- arguments ----------
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const emulator = process.argv.includes("--emulator");
const projectId = emulator ? "demo-prayerapp" : arg("project");
const apiKey = emulator ? "demo" : arg("api-key");
const bucket = emulator ? "demo-prayerapp.appspot.com" : arg("bucket") ?? `${projectId}.firebasestorage.app`;
const serviceAccountId = arg("service-account");

if (!emulator && (!projectId || !apiKey || !serviceAccountId)) {
  console.error("Missing --project, --api-key or --service-account. See docs/production-checks.md.");
  process.exit(1);
}
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
}

// ---------- setup ----------
const admin = initAdmin(
  emulator
    ? { projectId, storageBucket: bucket }
    : { projectId, storageBucket: bucket, credential: applicationDefault(), serviceAccountId },
);
const db = adminFirestore(admin);
const files = adminStorage(admin).bucket();

const RUN = randomBytes(4).toString("hex");
const uid = (tag) => `zzv${RUN}${tag}`;
const VIEWER = uid("v");
const AUTHORS = Array.from({ length: 16 }, (_, i) => uid(`a${i}`));
const MAIN = AUTHORS[0];
const PHOTO = `postPhotos/${MAIN}/zzv${RUN}.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

const created = { users: new Set(), docs: new Set(), apps: [] };
const report = { run: RUN, mode: emulator ? "emulator (dry run: B and D results are not meaningful)" : "production", checks: {} };
// E, F and G must pass in production (F's indexes aren't checked by the
// emulator); anything else is reported for the owner to read.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

async function clientFor(userId) {
  created.users.add(userId);
  await adminAuth(admin).createUser({ uid: userId }).catch((e) => {
    if (e.code !== "auth/uid-already-exists") throw e;
  });
  const token = await adminAuth(admin).createCustomToken(userId);
  const app = initializeApp({ apiKey, projectId, storageBucket: bucket, authDomain: `${projectId}.firebaseapp.com` }, userId);
  created.apps.push(app);
  const auth = getAuth(app);
  const fs = initializeFirestore(app, { localCache: memoryLocalCache() });
  const st = getStorage(app);
  if (emulator) {
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const [fh, fp] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    connectFirestoreEmulator(fs, fh, Number(fp));
    const [sh, sp] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
    connectStorageEmulator(st, sh, Number(sp));
  }
  await signInWithCustomToken(auth, token);
  return { fs, st };
}

async function setDocAdmin(path, data) {
  created.docs.add(path);
  await db.doc(path).set(data);
}

const follow = (a, b) => setDocAdmin(`follows/${a}_${b}`, { followerId: a, followeeId: b, createdAt: AdminTimestamp.now() });

async function seedPost(author, minutesAgo = 5, visibility = "friends") {
  const t = AdminTimestamp.fromMillis(Date.now() - minutesAgo * 60_000);
  const id = `${RUN}${minutesAgo}${visibility === "private" ? "p" : ""}_${author}`;
  const folder = visibility === "private" ? "privatePhotos" : "postPhotos";
  await setDocAdmin(`posts/${id}`, {
    authorId: author, promptId: "20000101", promptFiredAt: t, createdAt: t, visibility,
    notes: "verification post", photoPath: `${folder}/${author}/none.jpg`,
  });
  return id;
}

// ---------- B: feed query lookup limits ----------
async function checkFeedLimits(viewer) {
  const results = [];
  for (const k of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
    const authors = AUTHORS.slice(0, k);
    try {
      const snap = await getDocs(query(collection(viewer.fs, "posts"), where("authorId", "in", authors), where("visibility", "==", "friends"), orderBy("createdAt", "desc"), limit(50)));
      results.push({ friendsInQuery: k, ok: true, posts: snap.size });
    } catch (e) {
      results.push({ friendsInQuery: k, ok: false, code: e.code, message: String(e.message).slice(0, 200) });
    }
  }
  const okMax = Math.max(0, ...results.filter((r) => r.ok).map((r) => r.friendsInQuery));
  report.checks.B_feedQueryLimits = { largestWorkingInQuery: okMax, results };
  log(`B feed limits: largest working 'in' query = ${okMax} friends`);
}

// ---------- E: private posts stay with their author ----------
async function checkPrivatePosts(viewer, author) {
  const privateId = await seedPost(MAIN, 6, "private");
  const outcome = (p) => p.then((v) => ({ ok: true, ...v }), (e) => ({ ok: false, code: e.code }));
  const out = {
    // A friend's query that doesn't ask for shared posts only must be refused outright.
    unfilteredFriendQuery: await outcome(getDocs(query(collection(viewer.fs, "posts"), where("authorId", "==", MAIN)))
      .then((s) => ({ ids: s.docs.map((d) => d.id) }))),
    filteredFriendQuery: await outcome(getDocs(query(collection(viewer.fs, "posts"), where("authorId", "==", MAIN), where("visibility", "==", "friends")))
      .then((s) => ({ includesPrivate: s.docs.some((d) => d.id === privateId) }))),
    friendDirectGet: await outcome(getDoc(doc(viewer.fs, "posts", privateId)).then(() => ({}))),
    authorDirectGet: await outcome(getDoc(doc(author.fs, "posts", privateId)).then((d) => ({ exists: d.exists() }))),
  };
  out.pass = !out.unfilteredFriendQuery.ok && out.filteredFriendQuery.ok && !out.filteredFriendQuery.includesPrivate
    && !out.friendDirectGet.ok && out.authorDirectGet.ok && out.authorDirectGet.exists;
  report.checks.E_privatePosts = out;
  log(`E private posts hidden from friends = ${out.pass}`);
}

// ---------- F: Prayers tab queries (my own posts) and their indexes ----------
async function checkPrayersTab(author, viewer) {
  const t = AdminTimestamp.fromMillis(Date.now() - 400 * 24 * 60 * 60_000);
  const base = { authorId: MAIN, promptFiredAt: t, createdAt: t, notes: "verification post", visibility: "private", photoPath: `privatePhotos/${MAIN}/none.jpg` };
  await setDocAdmin(`posts/20240101_${MAIN}`, { ...base, promptId: "20240101", verseRef: "PHP.4.6-7", verseBook: "PHP", answeredAt: t });
  const mine = (...f) => getDocs(query(collection(author.fs, "posts"), where("authorId", "==", MAIN), ...f, limit(21)));
  const answered = [where("answeredAt", ">=", Timestamp.fromMillis(0)), orderBy("answeredAt", "desc")];
  const queries = {
    answered: () => mine(...answered),
    byBook: () => mine(where("verseBook", "==", "PHP"), orderBy("createdAt", "desc")),
    byVerse: () => mine(where("verseRef", "==", "PHP.4.6-7"), orderBy("createdAt", "desc")),
    answeredByBook: () => mine(where("verseBook", "==", "PHP"), ...answered),
    answeredByVerse: () => mine(where("verseRef", "==", "PHP.4.6-7"), ...answered),
    onThisDay: () => mine(where("promptId", "in", ["20240101", "20230101"])),
    // The Prayers calendar and "Your month in prayer": one app month.
    monthInPrayer: () => mine(where("promptId", ">=", "20240101"), where("promptId", "<", "20240201"), orderBy("promptId", "desc")),
  };
  const out = {};
  for (const [name, run] of Object.entries(queries)) {
    out[name] = await run().then((s) => ({ ok: true, found: s.size }), (e) => ({ ok: false, code: e.code, message: String(e.message).slice(0, 300) }));
  }
  // The same query from a friend must be refused (it could include private posts).
  out.friendRefused = await getDocs(query(collection(viewer.fs, "posts"), where("authorId", "==", MAIN), where("verseBook", "==", "PHP")))
    .then(() => false, (e) => e.code === "permission-denied");
  out.pass = Object.keys(queries).every((k) => out[k].ok && out[k].found === 1) && out.friendRefused;
  report.checks.F_prayersTab = out;
  log(`F Prayers tab queries (indexes built) = ${out.pass}`);
}

// ---------- G: "I'll pray for this" ----------
const REQUEST_ID = `zzv${RUN}req`;
async function checkPraying(author, viewer, other) {
  await setDocAdmin(`users/${MAIN}/friendsOnly/about`, { bio: "", prayerRequests: "Verification request", requestIds: [REQUEST_ID] });
  const tapPath = `users/${MAIN}/prayingFor/${REQUEST_ID}_${VIEWER}`;
  created.docs.add(tapPath);
  const outcome = (p) => p.then(() => true, (e) => e.code ?? false);
  const out = {
    friendCanTap: await outcome(setDoc(doc(viewer.fs, tapPath), { friendUid: VIEWER, itemId: REQUEST_ID, createdAt: serverTimestamp() })),
    ownerCanList: await getDocs(collection(author.fs, "users", MAIN, "prayingFor")).then((s) => s.size === 1, (e) => e.code),
    friendSeesOwnOnly: await getDocs(query(collection(viewer.fs, "users", MAIN, "prayingFor"), where("friendUid", "==", VIEWER))).then((s) => s.size === 1, (e) => e.code),
    // Someone who isn't MAIN's friend can't tap or read.
    strangerTapRefused: (await outcome(setDoc(doc(other.fs, `users/${MAIN}/prayingFor/${REQUEST_ID}_${AUTHORS[1]}`), { friendUid: AUTHORS[1], itemId: REQUEST_ID, createdAt: serverTimestamp() }))) === "permission-denied",
    strangerReadRefused: (await outcome(getDoc(doc(other.fs, tapPath)))) === "permission-denied",
    ownerCantTapOwn: (await outcome(setDoc(doc(author.fs, `users/${MAIN}/prayingFor/${REQUEST_ID}_${MAIN}`), { friendUid: MAIN, itemId: REQUEST_ID, createdAt: serverTimestamp() }))) === "permission-denied",
  };
  out.pass = Object.values(out).every((v) => v === true);
  report.checks.G_praying = out;
  log(`G prayer taps = ${out.pass}`);
}

// After C unfriends MAIN and VIEWER, the Cloud Function should delete VIEWER's tap.
async function checkPrayingCleanup() {
  const tapPath = `users/${MAIN}/prayingFor/${REQUEST_ID}_${VIEWER}`;
  const t0 = Date.now();
  let gone = false;
  while (!gone && Date.now() - t0 < 60_000) {
    gone = !(await db.doc(tapPath).get()).exists;
    if (!gone) await sleep(2000);
  }
  report.checks.G_praying.tapDeletedAfterUnfriend = gone;
  report.checks.G_praying.secondsUntilDeleted = gone ? Math.round((Date.now() - t0) / 1000) : null;
  report.checks.G_praying.pass &&= gone;
  log(`G tap deleted after unfriend = ${gone}`);
}

// ---------- C: open listener after unfriend ----------
async function checkListenerCutoff(viewer) {
  const events = [];
  const t0 = Date.now();
  const unsub = onSnapshot(
    query(collection(viewer.fs, "posts"), where("authorId", "==", MAIN), where("visibility", "==", "friends")),
    (s) => events.push({ t: Date.now() - t0, kind: "snapshot", ids: s.docs.map((d) => d.id) }),
    (e) => events.push({ t: Date.now() - t0, kind: "error", code: e.code }),
  );
  await sleep(3000);
  await db.doc(`follows/${MAIN}_${VIEWER}`).delete();
  const unfriendAt = Date.now() - t0;
  await sleep(5000);
  const erroredBeforeNewPost = events.some((e) => e.kind === "error");
  const newPost = await seedPost(MAIN, 0);
  await sleep(8000);
  unsub();
  const delivered = events.some((e) => e.kind === "snapshot" && e.ids.includes(newPost));
  report.checks.C_listenerCutoff = {
    unfriendAtMs: unfriendAt,
    cutOffWithoutNewData: erroredBeforeNewPost,
    newPostDeliveredAfterUnfriend: delivered,
    events,
  };
  log(`C listener: new post delivered after unfriend = ${delivered}; cut off before new data = ${erroredBeforeNewPost}`);
  await follow(MAIN, VIEWER); // restore friendship for D
}

// ---------- D: photo download links ----------
async function tokensOf(path) {
  const [md] = await files.file(path).getMetadata();
  return String(md.metadata?.firebaseStorageDownloadTokens ?? "").split(",").filter(Boolean);
}

async function statusOf(url) {
  try {
    return (await fetch(url)).status;
  } catch (e) {
    return `fetch failed: ${e.message}`;
  }
}

async function checkPhotoLinks(author, viewer) {
  const out = {};
  await uploadBytes(ref(author.st, PHOTO), JPEG, { contentType: "image/jpeg" });
  await sleep(8000); // let stripPhotoDownloadTokens run
  out.tokensAfterUploadAndStrip = (await tokensOf(PHOTO)).length;

  await getBytes(ref(viewer.st, PHOTO));
  await sleep(1000);
  out.tokensAfterFriendReadBytes = (await tokensOf(PHOTO)).length;

  const url = await getDownloadURL(ref(viewer.st, PHOTO));
  out.tokensAfterFriendGetDownloadURL = (await tokensOf(PHOTO)).length;
  out.urlStatusWhileFriends = await statusOf(url);

  // Unfriend the way the app does (client delete), which fires revokePhotoLinksOnUnfriend.
  const t0 = Date.now();
  await deleteDoc(doc(author.fs, "follows", `${MAIN}_${VIEWER}`));
  created.docs.delete(`follows/${MAIN}_${VIEWER}`);
  let status = out.urlStatusWhileFriends;
  while (Date.now() - t0 < 120_000) {
    await sleep(3000);
    status = await statusOf(url);
    if (status !== 200) break;
  }
  out.urlStatusAfterUnfriend = status;
  out.secondsUntilLinkDied = status === 200 ? null : Math.round((Date.now() - t0) / 1000);
  out.tokensAfterUnfriend = (await tokensOf(PHOTO)).length;
  out.viewerCanStillReadBytes = await getBytes(ref(viewer.st, PHOTO)).then(() => true, () => false);

  report.checks.D_photoLinks = out;
  log(`D photo link after unfriend: HTTP ${status} (${out.secondsUntilLinkDied ?? "never"}s)`);
}

// ---------- run ----------
async function cleanup() {
  for (const app of created.apps) await deleteApp(app).catch(() => {});
  created.docs.add(`users/${MAIN}/private/verseIndex`);
  for (const path of created.docs) await db.doc(path).delete().catch(() => {});
  await files.deleteFiles({ prefix: `postPhotos/zzv${RUN}` }).catch(() => {});
  for (const u of created.users) await adminAuth(admin).deleteUser(u).catch(() => {});
}

try {
  log(`run ${RUN} against ${report.mode}`);
  for (const a of AUTHORS) {
    await follow(VIEWER, a);
    await follow(a, VIEWER);
    await seedPost(a, 5);
  }
  const viewer = await clientFor(VIEWER);
  const author = await clientFor(MAIN);
  await checkFeedLimits(viewer);
  await checkPrivatePosts(viewer, author);
  await checkPrayersTab(author, viewer);
  await checkPraying(author, viewer, await clientFor(AUTHORS[1]));
  await checkListenerCutoff(viewer);
  await checkPrayingCleanup();
  await checkPhotoLinks(author, viewer);
} catch (e) {
  report.error = `${e.code ?? ""} ${e.message}`;
  console.error("Check failed:", e);
} finally {
  await cleanup();
  console.log("\n===== paste everything below this line =====");
  console.log(JSON.stringify(report, null, 2));
  const failed = ["E_privatePosts", "F_prayersTab", "G_praying"].some((k) => report.checks[k]?.pass === false);
  process.exit(report.error || failed ? 1 : 0);
}
