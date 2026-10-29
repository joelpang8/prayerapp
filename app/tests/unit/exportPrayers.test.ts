import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildExportHtml, type ExportPost } from "../../src/lib/exportPrayers";

const post = (extra: Partial<ExportPost>): ExportPost => ({
  promptId: "20261008",
  createdAt: new Date("2026-10-08T18:05:00Z"),
  notes: "For Mom's surgery",
  place: null,
  visibility: "friends",
  answeredAt: null,
  answerNote: null,
  verseRef: null,
  photoPath: "photos/me/a.jpg",
  ...extra,
});

describe("Download my prayers", () => {
  const html = buildExportHtml({
    name: "Sam <Lee>",
    posts: [
      post({ notes: "Older one", promptId: "20260101", createdAt: new Date("2026-01-01T15:00:00Z") }),
      post({ notes: "<b>not markup</b>\nsecond line", verseRef: "PSA.46.10", place: "Austin, Texas", answeredAt: new Date("2026-10-20T12:00:00Z"), answerNote: "It went well" }),
      post({ notes: "Just between me and God", visibility: "private", photoPath: "privatePhotos/me/b.jpg" }),
    ],
    photos: new Map([["photos/me/a.jpg", "QUJD"]]),
    verseText: new Map([["PSA.46.10", "Be still, and know that I am God"]]),
    savedVerses: ["JHN.3.16"],
    translation: "KJV",
    madeAt: new Date("2026-10-29T12:00:00Z"),
  });

  test("every one of my prayers, newest first, private ones included, with the app's day", () => {
    expect(html.indexOf("second line")).toBeLessThan(html.indexOf("Older one"));
    expect(html).toContain("Just between me and God");
    expect(html).toContain("🔒 Private");
    expect(html).toContain("Thursday, October 8, 2026");
    expect(html).toContain("3 prayers");
  });

  test("notes, place, answer, verse with its text, saved verses and photos", () => {
    expect(html).toContain("Austin, Texas");
    expect(html).toContain("It went well");
    expect(html).toContain("Psalm 46:10");
    expect(html).toContain("Be still, and know that I am God");
    expect(html).toContain("John 3:16");
    expect(html).toContain('src="data:image/jpeg;base64,QUJD"');
    expect(html).toContain("King James Version");
  });

  test("what I wrote is shown as text, never as markup", () => {
    expect(html).toContain("&lt;b&gt;not markup&lt;/b&gt;<br>second line");
    expect(html).toContain("Sam &lt;Lee&gt;");
    expect(html).not.toContain("<b>not markup</b>");
  });

  test("only my own things: the file never reads comments, reactions or taps", () => {
    const src = readFileSync("src/lib/exportPrayers.ts", "utf8");
    expect(src).not.toMatch(/"comments"|"reactions"|"prayingFor"|getDownloadURL/);
    expect(src).toContain('where("authorId", "==", uid)');
  });
});
