import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { acceptRequest, follow, watchFriendGraph } from "../src/lib/friends";
import { blockUser, fileReport, hiddenKey, unblockUser, watchBlocked, watchHidden } from "../src/lib/moderation";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["alice", "bob"]) await seedUser(env, u);
});

async function befriend() {
  await follow(dbAs(env, "alice"), "alice", "bob");
  await follow(dbAs(env, "bob"), "bob", "alice");
}

describe("blocking", () => {
  test("ends the friendship, shows in my blocked list, and a new request from them can't be accepted", async () => {
    await befriend();
    await blockUser(dbAs(env, "alice"), "alice", "bob", { iFollowThem: true, theyFollowMe: true });

    let friends: string[] = ["?"];
    const stopGraph = watchFriendGraph(dbAs(env, "alice"), "alice", (g) => { friends = [...g.friends]; });
    let blocked: string[] = [];
    const stopBlocked = watchBlocked(dbAs(env, "alice"), "alice", (b) => { blocked = [...b]; });
    try {
      await until(() => friends.length === 0 && blocked.length === 1);
      expect(blocked).toEqual(["bob"]);
      // Bob isn't told: his request still goes through...
      await follow(dbAs(env, "bob"), "bob", "alice");
      // ...but Alice can't accept it while he's blocked.
      await expect(acceptRequest(dbAs(env, "alice"), "alice", "bob")).rejects.toMatchObject({ code: "permission-denied" });
    } finally {
      stopGraph();
      stopBlocked();
    }
  });

  test("works on a pending request too (only existing edges are removed), and unblocking allows friending again", async () => {
    await follow(dbAs(env, "bob"), "bob", "alice");
    await blockUser(dbAs(env, "alice"), "alice", "bob", { iFollowThem: false, theyFollowMe: true });
    await unblockUser(dbAs(env, "alice"), "alice", "bob");
    await follow(dbAs(env, "bob"), "bob", "alice");
    await acceptRequest(dbAs(env, "alice"), "alice", "bob");
  });
});

describe("reporting", () => {
  test("a reported post or comment is hidden for me; reporting a user hides nothing", async () => {
    let hidden: string[] = [];
    const stop = watchHidden(dbAs(env, "alice"), "alice", (k) => { hidden = [...k].sort(); });
    try {
      await fileReport(dbAs(env, "alice"), "alice", { kind: "post", targetUid: "bob", postId: "20261007_bob", excerpt: "text" }, "inappropriate");
      await fileReport(dbAs(env, "alice"), "alice", { kind: "comment", targetUid: "bob", postId: "20261007_carol", commentId: "abc123" }, "harassment", "  rude  ");
      await fileReport(dbAs(env, "alice"), "alice", { kind: "user", targetUid: "bob" }, "spam");
      await until(() => hidden.length === 2);
      expect(hidden).toEqual([hiddenKey({ postId: "20261007_carol", commentId: "abc123" }), hiddenKey({ postId: "20261007_bob" })].sort());
    } finally {
      stop();
    }
  });
});
