import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// getDownloadURL() mints a permanent, rules-bypassing link to a photo. The
// app must only fetch post photos via getBytes (src/lib/photoCache.ts).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

test("no app code calls getDownloadURL", () => {
  const offenders = sourceFiles(join(__dirname, "../../src")).filter((f) =>
    /\bgetDownloadURL\s*\(/.test(readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")),
  );
  expect(offenders).toEqual([]);
});
