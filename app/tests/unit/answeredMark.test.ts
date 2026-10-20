import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const ui = readFileSync("src/components/ui.tsx", "utf8");

function color(palette: "light" | "dark", name: string): string {
  const block = ui.slice(ui.indexOf(`const ${palette}`));
  return new RegExp(`\\b${name}: "(#[0-9A-Fa-f]{6})"`).exec(block)![1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("answered prayers' gold mark", () => {
  test.each(["light", "dark"] as const)("the gold text is readable in %s mode (WCAG AA)", (mode) => {
    for (const bg of ["card", "bg", "goldSoft"]) {
      expect(contrast(color(mode, "gold"), color(mode, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("posts and the calendar use it, from the theme", () => {
    const card = readFileSync("src/components/PostCard.tsx", "utf8");
    expect(card).toContain("answered: { color: colors.gold, borderColor: colors.gold }");
    expect(card).toContain("!!post.answeredAt && styles.answeredCard");
    expect(readFileSync("src/components/MonthCalendar.tsx", "utf8")).toContain("borderColor: colors.gold");
  });
});

test("my own posts can be marked answered in one tap (not friends' posts)", () => {
  const own = readFileSync("src/components/OwnPostActions.tsx", "utf8");
  expect(own).toContain("await setAnswered(db, post, true);");
  expect(own).toMatch(/\{!post\.answeredAt && \(/);
});
