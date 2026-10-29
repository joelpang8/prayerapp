/**
 * Regenerates the bundled English Bibles that come from eBible.org (all
 * public domain). Download the "_vpl" zip, unzip it, and run:
 *
 *   npx tsx scripts/generate-english.ts <ID> path/to/<name>_vpl.txt
 *
 *   ID       eBible download (https://ebible.org/Scriptures/<name>_vpl.zip)
 *   BSB      engbsb      Berean Standard Bible
 *   WEB      engwebp     World English Bible (the 66-book edition)
 *   ASV      eng-asv     American Standard Version (1901)
 *   YLT      engylt      Young's Literal Translation
 *   DARBY    engDBY      Darby Translation
 *   WEBSTER  engwebster  Noah Webster Bible
 *   DRA      engDRA      Douay-Rheims 1899 (Catholic)
 *
 * Output: src/lib/scripture/<id>/, one file per book, [chapter][verse] -> text,
 * laid out on the KJV's numbering (which stored references use). Words in
 * [brackets] were added by the translators and are shown in italics.
 *  - Verses a translation leaves out (e.g. Matthew 17:21, kept only in a
 *    footnote) are empty strings; the app skips them, as printed Bibles do.
 *  - The WEB prints Romans 16:25-27 at the end of Romans 14 (as 14:24-26);
 *    they're put back at 16:25-27 so a reference finds them.
 *  - The Douay-Rheims follows the Latin Vulgate: most Psalms are numbered one
 *    lower, psalm titles are often their own verses, and some chapters divide
 *    their verses differently. Each chapter is matched to the KJV's: Psalm
 *    numbers are mapped, title verses are dropped, and every verse must match
 *    its KJV counterpart better than its neighbours (by shared words). Chapters
 *    that can't be matched with confidence are listed in
 *    DRA_NUMBERED_DIFFERENTLY and the app shows the KJV there, labelled KJV,
 *    rather than the wrong verse. Its extra books (Tobit, Judith…) aren't
 *    included: references only cover the 66 books.
 * Anything else that differs from the KJV table in books.ts is an error.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKS } from "../src/lib/scripture/books";
import { KJV_BOOKS } from "../src/lib/scripture/kjv";

const IDS = ["BSB", "WEB", "ASV", "YLT", "DARBY", "WEBSTER", "DRA"] as const;
type Id = (typeof IDS)[number];
const [id, file] = process.argv.slice(2) as [Id, string];
if (!IDS.includes(id) || !file) throw new Error(`Usage: npx tsx scripts/generate-english.ts ${IDS.join("|")} path/to/<name>_vpl.txt`);

const DEUTEROCANON = new Set(["TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA"]);

// Lines look like: GEN 1:1 In the beginning God created the heavens and the earth.
const LINE = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+) ?(.*)$/;
const byBook = new Map<string, Map<number, Map<number, string>>>();
const order: string[] = [];
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const m = LINE.exec(line);
  if (!m) throw new Error(`Unexpected line: ${line.slice(0, 80)}`);
  const [, code, ch, v, raw] = m;
  if (DEUTEROCANON.has(code)) continue;
  // The Douay-Rheims notes cross-references like "[2 Kings 16]" in a few psalm titles.
  const text = (id === "DRA" ? raw.replace(/\s*\[[^\]]*\d[^\]]*\]/g, "") : raw).replace(/\s+/g, " ").trim();
  if (!byBook.has(code)) {
    byBook.set(code, new Map());
    order.push(code);
  }
  const chapters = byBook.get(code)!;
  if (!chapters.has(Number(ch))) chapters.set(Number(ch), new Map());
  chapters.get(Number(ch))!.set(Number(v), text);
}
if (order.length !== BOOKS.length) throw new Error(`Expected ${BOOKS.length} books, got ${order.length}`);

/** Verses printed elsewhere than in the KJV: chapter:first..last -> chapter:first. */
const MOVED: Partial<Record<Id, { book: string; from: [number, number, number]; to: [number, number] }[]>> = {
  WEB: [{ book: "ROM", from: [14, 24, 26], to: [16, 25] }],
};

/** Same layout as the KJV: missing verses become "", anything extra is an error. */
function kjvNumbered(bookId: string, counts: readonly number[], source: Map<number, Map<number, string>>): string[][] {
  if (source.size !== counts.length) throw new Error(`${bookId}: ${source.size} chapters, KJV has ${counts.length}`);
  const moved = (MOVED[id] ?? []).filter((m) => m.book === bookId);
  const chapters = counts.map((count, ci) => {
    const src = source.get(ci + 1);
    if (!src) throw new Error(`${bookId} ${ci + 1} missing`);
    const out: string[] = [];
    for (let v = 1; v <= count; v++) out.push(src.get(v) ?? "");
    for (const v of src.keys()) {
      const elsewhere = moved.some((m) => m.from[0] === ci + 1 && v >= m.from[1] && v <= m.from[2]);
      if (v > count && !elsewhere) throw new Error(`${bookId} ${ci + 1}:${v} is beyond the KJV's ${count} verses`);
    }
    return out;
  });
  for (const m of moved) {
    const [fc, first, last] = m.from;
    for (let k = 0; k <= last - first; k++) {
      const text = source.get(fc)!.get(first + k);
      if (!text) throw new Error(`${bookId} ${fc}:${first + k} expected to be moved`);
      const [tc, tv] = m.to;
      if (chapters[tc - 1][tv - 1 + k]) throw new Error(`${bookId} ${tc}:${tv + k} already has text`);
      chapters[tc - 1][tv - 1 + k] = text;
    }
  }
  return chapters;
}

// --- Douay-Rheims: matching Vulgate chapters to the KJV's ---

/** KJV psalm -> Vulgate psalm, or null where one psalm is split or joined (9-10, 114-116, 147). */
function vulgatePsalm(k: number): number | null {
  if (k <= 8 || k >= 148) return k;
  if ([9, 10, 114, 115, 116, 147].includes(k)) return null;
  return k - 1;
}

const STOP = new Set("that with unto them they their have shall will which from thee thou your this there were said upon when what into hath been also then before those these because over even".split(" "));
const words = (s: string) => new Set((s.toLowerCase().replace(/\[|\]/g, "").match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
/** Shared words, 0..1. Verses too short to judge count as a match. */
function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size < 2 || B.size < 2) return 1;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

/** How many leading title verses to drop so the chapter lines up with the KJV's, or null if it doesn't. */
function vulgateOffset(kjv: string[], dra: string[], psalm: boolean): number | null {
  for (const o of psalm ? [0, 1, 2] : [0]) {
    if (dra.length !== kjv.length + o) continue;
    if (!dra.slice(0, o).every((t) => t.length < 160)) continue; // dropped verses must be short titles
    const s = kjv.map((t, v) => similarity(t, dra[v + o]));
    const avg = s.reduce((a, x) => a + x, 0) / kjv.length;
    const strict = s.every((x) => x > 0) && avg >= 0.3;
    const local = avg >= 0.1 && kjv.every((t, v) => {
      const before = v > 0 ? similarity(t, dra[v + o - 1]) : 0;
      const after = v + o + 1 < dra.length ? similarity(t, dra[v + o + 1]) : 0;
      return s[v] >= before && s[v] >= after;
    });
    if (strict || local) return o;
  }
  return null;
}

const differs: Record<string, number[]> = {};
async function vulgateNumbered(bookId: string, counts: readonly number[], source: Map<number, Map<number, string>>): Promise<string[][]> {
  const kjv = (await KJV_BOOKS[bookId]()).default as string[][];
  return counts.map((count, ci) => {
    const k = ci + 1;
    const from = bookId === "PSA" ? vulgatePsalm(k) : k;
    const src = from === null ? undefined : source.get(from);
    const dra = src ? [...src.keys()].sort((a, b) => a - b).map((v) => src.get(v)!) : [];
    const offset = src && dra.every(Boolean) && dra.length === src.size ? vulgateOffset(kjv[ci], dra, bookId === "PSA") : null;
    if (offset === null) {
      (differs[bookId] ??= []).push(k);
      return []; // shown in the KJV
    }
    return dra.slice(offset);
  });
}

async function main() {
  const outDir = join(import.meta.dirname, "..", "src", "lib", "scripture", id.toLowerCase());
  mkdirSync(outDir, { recursive: true });
  let verses = 0;
  const omitted: string[] = [];
  for (const [i, book] of BOOKS.entries()) {
    const source = byBook.get(order[i])!;
    const chapters = id === "DRA" ? await vulgateNumbered(book.id, book.verses, source) : kjvNumbered(book.id, book.verses, source);
    chapters.forEach((c, ci) =>
      c.forEach((text, vi) => {
        if (text) verses++;
        else omitted.push(`${book.id} ${ci + 1}:${vi + 1}`);
      }),
    );
    writeFileSync(join(outDir, `${book.id}.json`), JSON.stringify(chapters));
  }
  const loaders = BOOKS.map((b) => `  ${JSON.stringify(b.id)}: () => import("./${b.id}.json"),`).join("\n");
  writeFileSync(
    join(outDir, "index.ts"),
    `// GENERATED by scripts/generate-english.ts. Do not edit.\n` +
      `type Chapters = string[][];\n` +
      `export const ${id}_BOOKS: Record<string, () => Promise<{ default: Chapters }>> = {\n${loaders}\n};\n` +
      (id === "DRA"
        ? `/** Chapters that couldn't be matched to the KJV's numbering (empty here): the app shows the KJV there. */\n` +
          `export const DRA_NUMBERED_DIFFERENTLY: Record<string, readonly number[]> = ${JSON.stringify(differs)};\n`
        : ""),
  );
  console.log(`${id}: wrote ${BOOKS.length} books, ${verses} verses to ${outDir}`);
  console.log(`Left out (empty, skipped when shown): ${omitted.join(", ") || "none"}`);
  if (id === "DRA") {
    const n = Object.values(differs).reduce((a, c) => a + c.length, 0);
    console.log(`Chapters shown in the KJV instead: ${n} of 1189`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
