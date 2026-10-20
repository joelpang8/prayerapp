import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const compose = readFileSync("src/app/compose.tsx", "utf8");

describe("posting screen", () => {
  test("shows the day's verse at the top, without leaving for Read more", () => {
    expect(compose).toMatch(/<VerseBlock refId=\{verseRef\} readMore=\{false\} \/>/);
    // Above the photo and the notes.
    expect(compose.indexOf("<VerseBlock")).toBeLessThan(compose.indexOf("styles.photo}"));
    expect(compose).toContain("editing ? editing.verseRef : prompt?.verseRef");
  });

  test("editing never offers a new photo", () => {
    expect(compose).toMatch(/\{!editing && \(\s*<Button title=\{previewUri \? t\("compose.retakePhoto"\)/);
    expect(compose).not.toMatch(/newPhoto/);
  });
});

test("the notes counter shows only near the limit", () => {
  expect(compose).toContain("MAX_NOTES - notes.length <= NOTES_COUNTER_FROM");
  expect(compose).toMatch(/const NOTES_COUNTER_FROM = 200;/);
});
