import { collection, getDocs, orderBy, query, where, type Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import { locale, t, tn } from "../i18n";
import { bytesToBase64 } from "./base64";
import { storageLoader } from "./photoCache";
import { postFromSnapshot, type Post } from "./posts";
import { formatReference, parseRefId } from "./scripture/reference";
import { getPassage, plainText } from "./scripture/text";
import { TRANSLATIONS, type TranslationId } from "./scripture/translations";

/**
 * "Download my prayers" (Settings): a copy of my own prayers as one web page
 * file that opens anywhere and can be printed. It holds only my own things:
 * my posts (private ones included) with their photos, notes, places, verses
 * and answers, and my saved verses. Never anyone else's comments, reactions
 * or names. The file is made on the phone, handed to the share sheet, and
 * deleted from the phone afterwards; where it goes is the person's choice.
 */

export type ExportPost = Pick<Post, "promptId" | "createdAt" | "notes" | "place" | "visibility" | "answeredAt" | "answerNote" | "verseRef" | "photoPath">;

export type ExportInput = {
  name: string;
  posts: readonly ExportPost[];
  /** photoPath -> base64 JPEG, or missing if it couldn't be loaded (or photos were left out). */
  photos: ReadonlyMap<string, string>;
  /** Verse reference -> its text in my translation, where available. */
  verseText: ReadonlyMap<string, string>;
  savedVerses: readonly string[];
  translation: TranslationId;
  madeAt: Date;
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function refLabel(id: string): string {
  try {
    return formatReference(parseRefId(id));
  } catch {
    return id;
  }
}

/** A prompt id's day ("20261008") as "Thursday, October 8, 2026": the app's day, not the phone's. */
function dayOf(promptId: string): string {
  const d = new Date(Date.UTC(Number(promptId.slice(0, 4)), Number(promptId.slice(4, 6)) - 1, Number(promptId.slice(6, 8)), 12));
  return d.toLocaleDateString(locale(), { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/** The whole page. Pure: everything it shows is passed in. */
export function buildExportHtml(input: ExportInput): string {
  const posts = [...input.posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const made = input.madeAt.toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" });
  const entries = posts.map((p) => {
    const photo = input.photos.get(p.photoPath);
    const time = p.createdAt.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
    const labels = [
      p.visibility === "private" ? `🔒 ${t("compose.private")}` : "",
      p.answeredAt ? `✦ ${t("post.answered")}` : "",
    ].filter(Boolean);
    const verse = p.verseRef
      ? `<blockquote><cite>${escape(refLabel(p.verseRef))}</cite>${input.verseText.has(p.verseRef) ? `<p>${escape(input.verseText.get(p.verseRef)!)}</p>` : ""}</blockquote>`
      : "";
    const answer = p.answeredAt
      ? `<p class="answer">✦ ${escape(t("export.answeredOn", { day: p.answeredAt.toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" }) }))}${p.answerNote ? `<br>${escape(p.answerNote)}` : ""}</p>`
      : "";
    return `<article>
<h2>${escape(dayOf(p.promptId))}</h2>
<p class="meta">${escape([time, p.place ?? ""].filter(Boolean).join(" · "))}${labels.length ? ` · ${escape(labels.join(" · "))}` : ""}</p>
${photo ? `<img src="data:image/jpeg;base64,${photo}" alt="${escape(t("export.photoAlt"))}">` : ""}
<p class="notes">${escape(p.notes).replace(/\n/g, "<br>")}</p>
${answer}
${verse}
</article>`;
  });
  const saved = input.savedVerses.length
    ? `<section><h2>${escape(t("export.savedVerses"))}</h2><ul>${input.savedVerses.map((r) => `<li>${escape(refLabel(r))}</li>`).join("")}</ul></section>`
    : "";
  return `<!doctype html>
<html lang="${locale().startsWith("es") ? "es" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(t("export.title", { name: input.name }))}</title>
<style>
/* The app's day palette (ui.tsx), written out: this is a document, not app UI. */
body { font: 17px/1.5 Georgia, serif; color: #1F1B16; background: #FAF8F5; max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
h1 { font-size: 1.8rem; margin: 0 0 .25rem; }
h2 { font-size: 1.15rem; margin: 0; }
.intro, .meta { color: #6B645C; font-size: .9rem; margin: .25rem 0 .75rem; }
article { border-top: 1px solid #E6E1DA; padding: 1.25rem 0; break-inside: avoid; }
img { display: block; max-width: 100%; max-height: 28rem; border-radius: 10px; margin: .5rem 0; }
.notes { white-space: normal; margin: .5rem 0; }
.answer { background: #FBF3DF; border-left: 3px solid #8A5F0E; padding: .5rem .75rem; border-radius: 8px; }
blockquote { margin: .75rem 0 0; padding-left: .75rem; border-left: 2px solid #5B4B8A; }
cite { font-style: normal; font-weight: bold; color: #5B4B8A; }
blockquote p { margin: .25rem 0 0; }
section { border-top: 1px solid #E6E1DA; padding-top: 1.25rem; }
</style>
</head>
<body>
<h1>${escape(t("export.title", { name: input.name }))}</h1>
<p class="intro">${escape(t("export.intro", { prayers: tn("prayers.count", posts.length), date: made, translation: TRANSLATIONS.find((x) => x.id === input.translation)?.name ?? input.translation }))}</p>
${entries.join("\n")}
${saved}
</body>
</html>
`;
}

/** Every one of my posts, newest first (private ones included). The rules refuse this query to anyone else. */
export async function loadAllMyPosts(db: Firestore, uid: string): Promise<Post[]> {
  const snap = await getDocs(query(collection(db, "posts"), where("authorId", "==", uid), orderBy("createdAt", "desc")));
  return snap.docs.map(postFromSnapshot).filter((p): p is Post => !!p);
}

/** My saved verse references, most recently saved first. */
async function loadSavedVerses(db: Firestore, uid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "users", uid, "savedVerses"), orderBy("savedAt", "desc")));
  return snap.docs.map((d) => d.id);
}

/**
 * Gathers my prayers and builds the page. Photos are fetched one at a time
 * (they're mine, so the rules allow it), reporting progress; a photo that
 * can't be loaded is left out rather than failing the whole download.
 */
export async function makeExport(
  services: { db: Firestore; storage: FirebaseStorage },
  me: { uid: string; name: string; translation: TranslationId },
  opts: { photos: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ html: string; count: number }> {
  const [posts, savedVerses] = await Promise.all([loadAllMyPosts(services.db, me.uid), loadSavedVerses(services.db, me.uid)]);
  const photos = new Map<string, string>();
  if (opts.photos) {
    const load = storageLoader(services.storage);
    let done = 0;
    for (const p of posts) {
      try {
        photos.set(p.photoPath, bytesToBase64(await load(p.photoPath)));
      } catch (err) {
        console.warn("export: a photo couldn't be loaded", err);
      }
      opts.onProgress?.(++done, posts.length);
    }
  }
  const verseText = new Map<string, string>();
  for (const ref of new Set(posts.map((p) => p.verseRef).filter((r): r is string => !!r))) {
    try {
      const passage = await getPassage(ref, me.translation);
      verseText.set(ref, passage.verses.map((v) => plainText(v.segments)).join(" "));
    } catch {
      // Shown by reference only.
    }
  }
  return {
    html: buildExportHtml({ name: me.name, posts, photos, verseText, savedVerses, translation: me.translation, madeAt: new Date() }),
    count: posts.length,
  };
}
