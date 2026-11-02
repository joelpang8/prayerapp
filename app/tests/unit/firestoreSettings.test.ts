import { expect, test } from "vitest";
import { firestoreSettings } from "../../src/lib/firestoreSettings";

test("live updates use long polling, so React Native doesn't hold them back", () => {
  expect(firestoreSettings.experimentalForceLongPolling).toBe(true);
  expect(firestoreSettings.experimentalAutoDetectLongPolling).toBeUndefined(); // can't be combined
});
