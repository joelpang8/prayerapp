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
