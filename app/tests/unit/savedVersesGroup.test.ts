import { expect, test } from "vitest";
import { groupSavedVerses } from "../../src/lib/savedVerses";

const v = (refId: string) => ({ refId, savedAt: new Date() });

test("saved verses are grouped by book in Bible order, verses in order", () => {
  const groups = groupSavedVerses([v("PHP.4.6-7"), v("PSA.46.10"), v("GEN.1.1"), v("PSA.23"), v("PSA.23.4"), v("PHP.1.6"), v("bad ref")]);
  expect(groups).toEqual([
    { book: "GEN", refIds: ["GEN.1.1"] },
    { book: "PSA", refIds: ["PSA.23", "PSA.23.4", "PSA.46.10"] },
    { book: "PHP", refIds: ["PHP.1.6", "PHP.4.6-7"] },
  ]);
  expect(groupSavedVerses([])).toEqual([]);
});
