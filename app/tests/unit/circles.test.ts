import { describe, expect, test } from "vitest";
import { circleNameProblem, invitesLeft, MAX_CIRCLE_PEOPLE, requestFromData, visibleRequests } from "../../src/lib/circles";

const req = (id: string, authorId: string) => requestFromData(id, { authorId, text: "t", prayedBy: [] });

describe("prayer circles (pure parts)", () => {
  test("a name of 1-40 characters", () => {
    expect(circleNameProblem("  ")).toBe("empty");
    expect(circleNameProblem("x".repeat(41))).toBe("long");
    expect(circleNameProblem("  Small group ")).toBeNull();
  });

  test("up to 30 people, members and invitations together", () => {
    expect(MAX_CIRCLE_PEOPLE).toBe(30);
    expect(invitesLeft({ memberIds: ["a", "b"], invitedIds: ["c"] })).toBe(27);
    expect(invitesLeft({ memberIds: Array(30).fill("x"), invitedIds: [] })).toBe(0);
  });

  test("requests from people I've blocked, or that I reported, are left out", () => {
    const shown = visibleRequests([req("1", "ann"), req("2", "blockedGuy"), req("3", "ben")], new Set(["blockedGuy"]), (id) => id === "3");
    expect(shown.map((r) => r.id)).toEqual(["1"]);
  });

  test("answered is read from the stored fields; malformed lists are ignored", () => {
    expect(requestFromData("x", { authorId: "a", text: "t", prayedBy: ["b", 3], answeredAt: null, answerNote: "Yes" })).toMatchObject({ prayedBy: ["b"], answered: { note: "Yes" } });
    expect(requestFromData("x", { authorId: "a", text: "t" }).answered).toBeNull();
  });
});

describe("circle photos", async () => {
  const { circlePhotoPath, circleFromData } = await import("../../src/lib/circles");
  test("stored in the circle's own folder, plain JPEG names only", () => {
    expect(circlePhotoPath("c1", "abc123")).toBe("circlePhotos/c1/abc123.jpg");
    expect(() => circlePhotoPath("c1", "../x")).toThrow();
  });
  test("read from the circle doc; missing means no photo", () => {
    expect(circleFromData("c1", { name: "G", photoPath: "circlePhotos/c1/a.jpg" }).photoPath).toBe("circlePhotos/c1/a.jpg");
    expect(circleFromData("c1", { name: "G" }).photoPath).toBeNull();
  });
});

describe("arranging a circle's list", async () => {
  const { arrangeRequests, circleFromData, requestFromData: from } = await import("../../src/lib/circles");
  const open = (id: string) => from(id, { authorId: "a", text: id, prayedBy: [] });
  const answered = (id: string, ms: number) => ({ ...from(id, { authorId: "a", text: id, prayedBy: [], answeredAt: null }), answered: { at: new Date(ms), note: "" } });

  test("pinned first, then open, then answered (most recently answered first)", () => {
    const r = arrangeRequests([open("o1"), answered("a1", 1000), open("p"), answered("a2", 2000), open("o2")], "p");
    expect(r.pinned?.id).toBe("p");
    expect(r.open.map((x) => x.id)).toEqual(["o1", "o2"]);
    expect(r.answered.map((x) => x.id)).toEqual(["a2", "a1"]);
  });

  test("a pin that's gone or answered is ignored", () => {
    expect(arrangeRequests([open("o1")], "gone").pinned).toBeNull();
    const r = arrangeRequests([answered("a1", 1)], "a1");
    expect(r.pinned).toBeNull();
    expect(r.answered).toHaveLength(1);
  });

  test("a weekly prayer time is read back only when it's valid", () => {
    expect(circleFromData("c", { prayerTime: { weekday: 2, hour: 19, minute: 0, timeZone: "America/Chicago" } }).prayerTime).toEqual({ weekday: 2, hour: 19, minute: 0, timeZone: "America/Chicago" });
    expect(circleFromData("c", { prayerTime: { weekday: 9, hour: 19, minute: 0, timeZone: "x" } }).prayerTime).toBeNull();
  });
});
