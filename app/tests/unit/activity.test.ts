import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
const { buildActivity, timeAgo, ACTIVITY_WINDOW_MS } = await import("../../src/lib/activity");

const now = new Date("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const H = 3600_000;
const post = (id: string, authorId: string, createdAt: Date, answeredAt: Date | null = null) => ({
  id, authorId, createdAt, answeredAt, answerNote: answeredAt ? "Yes!" : null,
  promptId: "p", promptFiredAt: createdAt, editedAt: null, notes: "n", photoPath: "x", verseRef: null, place: null,
});

describe("buildActivity", () => {
  const friends = new Set(["bob", "carol"]);
  const base = { me: "alice", isFriend: (u: string) => friends.has(u), now };

  test("friends praying and answered prayers, plus comments and reactions on my posts, newest first", () => {
    const items = buildActivity({
      ...base,
      feed: [post("p1", "bob", ago(5 * H)), post("p2", "carol", ago(30 * H), ago(1 * H))],
      onMyPosts: [{
        postId: "mine",
        comments: [{ id: "c1", postId: "mine", authorId: "bob", text: "Amen", createdAt: ago(2 * H) }],
        reactions: [{ postId: "mine", authorId: "carol", kind: "praying", createdAt: ago(3 * H) }],
      }],
    });
    expect(items.map((a) => `${a.kind}:${a.actorId}`)).toEqual([
      "answered:carol", "commented:bob", "reacted:carol", "posted:bob", "posted:carol",
    ]);
    expect(items[0].text).toBe("Yes!");
  });

  test("leaves out my own actions, non-friends, and anything older than a week", () => {
    const items = buildActivity({
      ...base,
      feed: [post("p1", "dave", ago(H)), post("p2", "bob", ago(ACTIVITY_WINDOW_MS + H))],
      onMyPosts: [{
        postId: "mine",
        comments: [{ id: "c1", postId: "mine", authorId: "alice", text: "my own", createdAt: ago(H) }],
        reactions: [{ postId: "mine", authorId: "dave", kind: "love", createdAt: ago(H) }],
      }],
    });
    expect(items).toEqual([]);
  });
});

test("timeAgo", () => {
  expect(timeAgo(ago(10_000), now)).toBe("now");
  expect(timeAgo(ago(5 * 60_000), now)).toBe("5m");
  expect(timeAgo(ago(3 * H), now)).toBe("3h");
  expect(timeAgo(ago(50 * H), now)).toBe("2d");
});
