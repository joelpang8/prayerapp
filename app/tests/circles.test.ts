import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import {
  acceptInvite, addCircleRequest, createCircle, declineInvite, deleteCircle, leaveCircle, removeMember, setCircleRequestAnswered, setPrayed,
  watchCircle, watchCircleRequests, watchMyCircles, type Circle, type CircleRequest,
} from "../src/lib/circles";
import { follow } from "../src/lib/friends";
import { dbAs, seedUser, setupEnv, until } from "./env";

let env: RulesTestEnvironment;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.cleanup(); });

async function befriend(a: string, b: string) {
  await follow(dbAs(env, a), a, b);
  await follow(dbAs(env, b), b, a);
}

beforeEach(async () => {
  await env.clearFirestore();
  for (const u of ["lead", "ann", "ben", "cat"]) await seedUser(env, u);
  await befriend("lead", "ann");
  await befriend("lead", "ben");
});

function requestsAs(uid: string, circleId: string) {
  const state: { list: CircleRequest[]; error: Error | null } = { list: [], error: null };
  const stop = watchCircleRequests(dbAs(env, uid), circleId, (l) => { state.list = l; }, (e) => { state.error = e; });
  return { state, stop };
}

describe("prayer circles, end to end", () => {
  test("start, invite, accept, pray, answer, leave and delete", async () => {
    const id = await createCircle(dbAs(env, "lead"), "lead", "  Small group  ", ["ann", "ben"]);
    let c: Circle | null = null;
    const stopCircle = watchCircle(dbAs(env, "lead"), id, (x) => { c = x; });
    await until(() => c !== null && c.invitedIds.length === 2);
    expect(c!).toMatchObject({ name: "Small group", leaderId: "lead", memberIds: ["lead"], invitedIds: ["ann", "ben"] });
    stopCircle();

    // Ann joins; Ben declines; Cat (not invited) sees nothing.
    await acceptInvite(dbAs(env, "ann"), id, "ann");
    await declineInvite(dbAs(env, "ben"), id, "ben");
    let annCircles: Circle[] = [];
    const stopMine = watchMyCircles(dbAs(env, "ann"), "ann", (l) => { annCircles = l; });
    await until(() => annCircles.length === 1);
    stopMine();
    await expect(getDoc(doc(dbAs(env, "cat"), "circles", id))).rejects.toThrow();

    // Ann adds a request; the leader prays; Ann marks it answered.
    await addCircleRequest(dbAs(env, "ann"), id, "ann", "Wisdom for a big decision");
    const lead = requestsAs("lead", id);
    await until(() => lead.state.list.length === 1);
    const req = lead.state.list[0];
    await setPrayed(dbAs(env, "lead"), id, req.id, "lead", true);
    await until(() => lead.state.list[0]?.prayedBy.includes("lead"));
    await setCircleRequestAnswered(dbAs(env, "ann"), id, req.id, "Took the job!");
    await until(() => lead.state.list[0]?.answered?.note === "Took the job!");

    // Ann leaves: her request goes with her, and her access ends.
    await leaveCircle(dbAs(env, "ann"), id, "ann");
    await until(() => lead.state.list.length === 0);
    await expect(getDoc(doc(dbAs(env, "ann"), "circles", id))).rejects.toThrow();

    // The leader deletes the circle.
    await addCircleRequest(dbAs(env, "lead"), id, "lead", "Our church");
    await until(() => lead.state.list.length === 1);
    lead.stop();
    await deleteCircle(dbAs(env, "lead"), id);
    await expect(getDoc(doc(dbAs(env, "lead"), "circles", id))).rejects.toThrow();
  });

  test("removing a member removes their requests and cuts them off", async () => {
    const id = await createCircle(dbAs(env, "lead"), "lead", "Family", ["ann"]);
    await acceptInvite(dbAs(env, "ann"), id, "ann");
    await addCircleRequest(dbAs(env, "ann"), id, "ann", "Mum's health");
    const ann = requestsAs("ann", id);
    await until(() => ann.state.list.length === 1);
    await removeMember(dbAs(env, "lead"), id, "ann");
    // Her request is gone, and a fresh read is refused.
    await until(() => ann.state.list.length === 0 || ann.state.error !== null);
    ann.stop();
    await expect(getDocs(collection(dbAs(env, "ann"), "circles", id, "circleRequests"))).rejects.toThrow();
    const lead = requestsAs("lead", id);
    await until(() => lead.state.error === null);
    await new Promise((r) => setTimeout(r, 300));
    expect(lead.state.list).toEqual([]);
    lead.stop();
  });

  test("only friends can be invited", async () => {
    await expect(createCircle(dbAs(env, "lead"), "lead", "Group", ["cat"])).rejects.toThrow();
  });
});
