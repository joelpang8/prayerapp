import { describe, expect, test } from "vitest";
import { ACTS_STEPS, hintVisible } from "../../src/lib/acts";

describe("prayer helper (ACTS)", () => {
  test("four steps in order, in plain words", () => {
    expect(ACTS_STEPS.map((s) => s.label)).toEqual(["Praise", "Sorry", "Thanks", "Asking"]);
    for (const s of ACTS_STEPS) expect(s.hint).toMatch(/\?$/);
  });

  test("a hint shows until the notes change, and never adds to them", () => {
    expect(hintVisible(null, "")).toBe(false);
    expect(hintVisible({ notesAtTap: "" }, "")).toBe(true);
    expect(hintVisible({ notesAtTap: "" }, "L")).toBe(false);
    expect(hintVisible({ notesAtTap: "Lord, " }, "Lord, ")).toBe(true);
    expect(hintVisible({ notesAtTap: "Lord, " }, "Lord, t")).toBe(false);
  });
});
