import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { circleYear, circleYearHtml } from "../../src/lib/circleYear";
import type { CircleRequest } from "../../src/lib/circles";

const req = (id: string, created: string, answered: string | null, prayedBy: string[] = []): CircleRequest => ({
  id, authorId: "ann", text: `Request ${id}`, createdAt: new Date(created), prayedBy,
  answered: answered ? { at: new Date(answered), note: `Note ${id}` } : null,
});

test("counts the year's requests and prayers; lists what was answered that year, in order", () => {
  const created = [req("a", "2026-02-01T12:00", null, ["x", "y"]), req("b", "2026-05-01T12:00", "2026-06-01T12:00", ["x"]), req("old", "2025-12-30T12:00", null, ["x"])];
  const answered = [req("b", "2026-05-01T12:00", "2026-06-01T12:00"), req("c", "2025-11-01T12:00", "2026-01-10T12:00"), req("d", "2025-01-01T12:00", "2025-03-01T12:00")];
  const y = circleYear(created, answered, 2026);
  expect(y.requests).toBe(2);
  expect(y.prayers).toBe(3);
  expect(y.answered.map((r) => r.id)).toEqual(["c", "b"]);
});

test("the printed page escapes members' words", () => {
  const html = circleYearHtml({ title: "T", subtitle: "Small <group>", stats: "s", empty: "e", items: [{ name: "Ann", text: "<b>x</b>", note: "ok & done", when: "June 1" }] });
  expect(html).toContain("Small &lt;group&gt;");
  expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  expect(html).toContain("ok &amp; done");
});

test("printing never makes a file, and the page is reachable from the circle", () => {
  const screen = readFileSync("src/app/circle-year/[id].tsx", "utf8");
  expect(screen).toContain("Print.printAsync(");
  expect(screen).not.toContain("printToFileAsync");
  expect(readFileSync("src/app/circle/[id].tsx", "utf8")).toContain('pathname: "/circle-year/[id]"');
});
