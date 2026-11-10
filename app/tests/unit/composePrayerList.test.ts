import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-haptics", () => ({}));
vi.mock("../../src/firebase", () => ({ db: {} }));
vi.mock("../../src/lib/saveLater", () => ({ saveLater: () => {} }));

test("tapping a name adds it to the prayer once, on its own line, within the limit", async () => {
  const { lineFor, withLine } = await import("../../src/lib/composeList");
  expect(withLine("", lineFor("Mum"))).toBe("🙏 Mum");
  expect(withLine("For our church  ", lineFor("Mum"))).toBe("For our church\n🙏 Mum");
  expect(withLine("For our church\n🙏 Mum", lineFor("Mum"))).toBe("For our church\n🙏 Mum");
  expect(withLine("x".repeat(10), lineFor("Grandpa Joe"), 12)).toBe("x".repeat(10));
});

test("it's on the posting screen (not when editing), adds names only, and shares the ✓ Prayed marks", () => {
  expect(readFileSync("src/app/compose.tsx", "utf8")).toContain("{!editing && <ComposePrayerList notes={notes} onNotes={setNotes} />}");
  const src = readFileSync("src/components/ComposePrayerList.tsx", "utf8");
  expect(src).toContain("lineFor(item.name)");
  expect(src).not.toMatch(/lineFor\(item\.note/);
  expect(readFileSync("src/session/usePrayerList.ts", "utf8")).toContain("const prayedStore");
});
