import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("haptics only for the moments that matter, never while typing or scrolling", () => {
  const uses = {
    "src/app/compose.tsx": "haptics.done()",
    "src/components/OwnPostActions.tsx": "haptics.done()",
    "src/components/PrayerRequests.tsx": "haptics.tap()",
    "src/components/VerseBlock.tsx": "haptics.tap()",
    // The "amen" when a prayer actually reaches the server (from the outbox).
    "src/session/SessionProvider.tsx": "haptics.amen()",
  };
  for (const [file, call] of Object.entries(uses)) expect(readFileSync(file, "utf8"), file).toContain(call);
  const compose = readFileSync("src/app/compose.tsx", "utf8");
  expect(compose.match(/haptics\./g)).toHaveLength(1);
  expect(readFileSync("src/lib/haptics.ts", "utf8")).toMatch(/catch\(\(\) => \{\}\)/);
});

test("the amen is a soft double tap, only for posts actually sent", async () => {
  const src = readFileSync("src/lib/haptics.ts", "utf8");
  expect(src.match(/ImpactFeedbackStyle\.Soft/g)).toHaveLength(2);
  const { Outbox } = await import("../../src/lib/outbox");
  const saved: unknown[] = [];
  const sentNow: string[] = [];
  const existing = new Set(["already-there"]);
  const box = new Outbox("me", { load: async () => [], save: async (_u, items) => { saved.push(items); } }, {
    exists: async (id: string) => existing.has(id),
    send: async () => {},
  } as never);
  box.onSent((id) => sentNow.push(id));
  const item = (postId: string) => ({ postId, uid: "me", prompt: { id: "p", firedAt: 0, verseRef: null }, notes: "n", photoUri: "u", photoId: "i", place: null, visibility: "friends", takenAt: null, startedAt: null }) as never;
  await box.enqueue(item("new-post"));
  await box.flush();
  await box.enqueue(item("already-there"));
  await box.flush();
  expect(sentNow).toEqual(["new-post"]);
});
