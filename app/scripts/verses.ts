/**
 * Checks the curated verse list and writes what the scheduler reads.
 *
 *   npm run verses            check firebase/verses/verses.txt, write verse-list.json
 *   npm run verses -- --check CI: fail if the list has errors or verse-list.json is stale
 *   npm run verses -- --max-verses 10   also enforce a licence cap on passage length
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkVerseList, toVerseListJson } from "../src/lib/scripture/curatedList";

const root = join(import.meta.dirname, "..", "..");
const LIST = join(root, "firebase", "verses", "verses.txt");
const OUT = join(root, "firebase", "functions", "src", "verse-list.json");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const capIdx = args.indexOf("--max-verses");
const maxVerses = capIdx >= 0 ? Number(args[capIdx + 1]) : undefined;

const report = checkVerseList(readFileSync(LIST, "utf8"), { maxVerses });
const rel = (p: string) => p.slice(root.length + 1);

for (const e of report.entries) {
  console.log(`  line ${String(e.line).padStart(3)}  ${e.display.padEnd(28)} ${e.id.padEnd(16)} ${e.verses} verse${e.verses === 1 ? "" : "s"}`);
}
for (const w of report.warnings) console.log(`warning  line ${w.line}: ${w.message}`);
for (const e of report.errors) console.log(`ERROR    line ${e.line}: ${e.message}`);
console.log(`\n${report.entries.length} verses, ${report.warnings.length} warnings, ${report.errors.length} errors`);

if (report.errors.length) process.exit(1);
const json = toVerseListJson(report);
if (checkOnly) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== json) {
    console.log(`${rel(OUT)} is out of date. Run: cd app && npm run verses`);
    process.exit(1);
  }
  console.log(`${rel(OUT)} is up to date.`);
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${rel(OUT)}`);
}
