// One-off, after deploying the "Prayers tab filters" change: gives posts
// made before it their verseBook (so the verse filter finds them) and builds
// each author's verse index (users/{uid}/private/verseIndex) for the picker.
// Safe to run more than once. Changes nothing else on a post.
//
//   node scripts/backfill-verse-books.mjs                       # local emulators
//   node scripts/backfill-verse-books.mjs --project <id>        # real project: shows what it would do
//   node scripts/backfill-verse-books.mjs --project <id> --yes  # real project: does it
//
// Real project: uses your own Google login (gcloud auth application-default login).
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const p = process.argv.indexOf("--project");
const project = p > 0 ? process.argv[p + 1] : "demo-prayerapp";
const real = !project.startsWith("demo-");
const write = !real || process.argv.includes("--yes");
if (real && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(`Refusing: FIRESTORE_EMULATOR_HOST is set, but --project ${project} is a real project. Unset it first.`);
  process.exit(1);
}
if (!real) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

const db = getFirestore(initializeApp({ projectId: project }));
// Must match functions/src/prayers.ts.
const bookOf = (ref) => ref.split(".")[0];

const posts = await db.collection("posts").select("authorId", "verseRef", "verseBook").get();
const needsBook = posts.docs.filter((d) => typeof d.get("verseRef") === "string" && d.get("verseBook") !== bookOf(d.get("verseRef")));
const byAuthor = new Map();
for (const d of posts.docs) {
  const author = d.get("authorId");
  const ref = d.get("verseRef");
  if (typeof author !== "string") continue;
  const index = byAuthor.get(author) ?? { books: {}, refs: {} };
  if (typeof ref === "string" && ref) {
    index.books[bookOf(ref)] = (index.books[bookOf(ref)] ?? 0) + 1;
    index.refs[ref] = (index.refs[ref] ?? 0) + 1;
  }
  byAuthor.set(author, index);
}

console.log(`${project}: ${posts.size} posts; ${needsBook.length} need verseBook; ${byAuthor.size} authors' verse indexes to write.`);
if (!write) {
  console.log("Nothing written. Add --yes to do it.");
  process.exit(0);
}
let batch = db.batch();
let n = 0;
const flush = async () => { if (n) await batch.commit(); batch = db.batch(); n = 0; };
for (const d of needsBook) {
  batch.update(d.ref, { verseBook: bookOf(d.get("verseRef")) });
  if (++n === 400) await flush();
}
for (const [author, index] of byAuthor) {
  batch.set(db.doc(`users/${author}/private/verseIndex`), index);
  if (++n === 400) await flush();
}
await flush();
console.log("Done.");
