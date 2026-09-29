import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  acceptRequest, cancelRequest, declineRequest, follow, removeFriend, watchFriendGraph, type FriendGraph,
} from "../src/lib/friends";
import { createProfile, findByUsername, UsernameTakenError } from "../src/lib/profile";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

function watch(uid: string) {
  const state: { graph: FriendGraph | null } = { graph: null };
  const stop = watchFriendGraph(dbAs(env, uid), uid, (g) => { state.graph = g; });
  return { state, stop };
}

describe("profile", () => {
  test("sign-up claims a username; the same username can't be claimed twice", async () => {
    await createProfile(dbAs(env, "alice"), "alice", "alice_p", " Alice ");
    await expect(createProfile(dbAs(env, "bob"), "bob", "alice_p", "Bob")).rejects.toBeInstanceOf(UsernameTakenError);
    const found = await findByUsername(dbAs(env, "bob"), "@Alice_P ");
    expect(found).toEqual({ uid: "alice", username: "alice_p", displayName: "Alice" });
    expect(await findByUsername(dbAs(env, "bob"), "nobody")).toBeNull();
    expect(await findByUsername(dbAs(env, "bob"), "bad name!")).toBeNull();
  });
});

describe("friend flows against the real rules", () => {
  beforeEach(async () => {
    await seedUser(env, "alice");
    await seedUser(env, "bob");
  });

  test("request -> accept -> remove, seen live from both sides", async () => {
    const a = watch("alice");
    const b = watch("bob");
    try {
      await until(() => a.state.graph !== null && b.state.graph !== null);

      await follow(dbAs(env, "alice"), "alice", "bob");
      await until(() => b.state.graph!.incoming.has("alice") && a.state.graph!.outgoing.has("bob"));

      await acceptRequest(dbAs(env, "bob"), "bob", "alice");
      await until(() => a.state.graph!.friends.has("bob") && b.state.graph!.friends.has("alice"));

      // Record every graph alice sees while bob removes her.
      const aliceSaw: string[] = [];
      const stopRecording = watchFriendGraph(dbAs(env, "alice"), "alice", (g) =>
        aliceSaw.push(`friends=${[...g.friends]} out=${[...g.outgoing]} in=${[...g.incoming]}`));
      await until(() => aliceSaw.length > 0);
      await removeFriend(dbAs(env, "bob"), "bob", "alice");
      await until(() => !a.state.graph!.friends.has("bob") && !b.state.graph!.friends.has("alice"));
      stopRecording();
      // Both edges gone: nobody is left with a pending request...
      expect(a.state.graph!.incoming.size + a.state.graph!.outgoing.size).toBe(0);
      expect(b.state.graph!.incoming.size + b.state.graph!.outgoing.size).toBe(0);
      // ...and alice never saw a half-removed state that looks like a request.
      expect(aliceSaw).toEqual(["friends=bob out= in=", "friends= out= in="]);
    } finally {
      a.stop();
      b.stop();
    }
  });

  test("decline and cancel", async () => {
    await follow(dbAs(env, "alice"), "alice", "bob");
    await declineRequest(dbAs(env, "bob"), "bob", "alice");
    await follow(dbAs(env, "alice"), "alice", "bob");
    await cancelRequest(dbAs(env, "alice"), "alice", "bob");
    const b = watch("bob");
    try {
      await until(() => b.state.graph !== null);
      expect(b.state.graph!.incoming.size).toBe(0);
    } finally {
      b.stop();
    }
  });

  test("removeFriend tolerates both people removing each other at once", async () => {
    await follow(dbAs(env, "alice"), "alice", "bob");
    await follow(dbAs(env, "bob"), "bob", "alice");
    await Promise.all([
      removeFriend(dbAs(env, "alice"), "alice", "bob"),
      removeFriend(dbAs(env, "bob"), "bob", "alice"),
    ]);
    // Second call after everything's gone is also fine.
    await removeFriend(dbAs(env, "alice"), "alice", "bob");
  });
});
