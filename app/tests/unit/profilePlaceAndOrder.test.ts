import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { assignRequestIds, moveRow, requestItems } from "../../src/lib/prayerRequests";

describe("reordering prayer requests", () => {
  test("moves one up or down; nothing at the ends", () => {
    expect(moveRow(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveRow(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveRow(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveRow(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  test("a moved request keeps its id, so who's praying for it stays with it", () => {
    const before = requestItems("Mom's surgery\nNew job\nPeace at home", ["idMom00001", "idJob00001", "idPeace0001"]);
    const lines = moveRow(before.map((r) => r.text), 2, -1); // Peace up one
    expect(lines).toEqual(["Mom's surgery", "Peace at home", "New job"]);
    expect(assignRequestIds(before, lines, () => "NEWID00000")).toEqual(["idMom00001", "idPeace0001", "idJob00001"]);
  });
});

describe("Where I'm from", () => {
  test("a picked place is only a name: search keeps town names, never coordinates", async () => {
    const { uniquePlaceNames } = await import("../../src/lib/placeNames");
    expect(uniquePlaceNames(["Austin, Texas", null, "austin, texas", "Lagos, Nigeria"])).toEqual(["Austin, Texas", "Lagos, Nigeria"]);
    const field = readFileSync("src/components/PlaceField.tsx", "utf8");
    expect(field).not.toMatch(/latitude|longitude|coords/);
    const lib = readFileSync("src/lib/location.ts", "utf8");
    const search = lib.slice(lib.indexOf("export async function searchPlaceNames"));
    expect(search).toContain("placeName(address)");
    expect(search).not.toMatch(/requestForegroundPermissionsAsync/); // typing a town needs no permission
  });
});

describe("answered requests: stored form", async () => {
  const { answerFields, answersFromData } = await import("../../src/lib/prayerRequests");
  test("ids with notes in the same order, only for current requests, notes trimmed to 120", () => {
    const answers = new Map([["b", "  Yes!  "], ["gone", "x"], ["a", "y".repeat(200)]]);
    expect(answerFields(answers, ["a", "b", "c"])).toEqual({ answeredIds: ["a", "b"], answerNotes: ["y".repeat(120), "Yes!"] });
    expect(answerFields(new Map(), ["a"])).toBeNull();
  });
  test("reading back ignores anything malformed", () => {
    expect([...answersFromData(["a", "b"], ["x", ""])]).toEqual([["a", "x"], ["b", ""]]);
    expect(answersFromData(["a"], []).size).toBe(0);
    expect(answersFromData("a", ["x"]).size).toBe(0);
  });
});
