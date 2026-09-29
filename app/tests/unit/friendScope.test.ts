import { describe, expect, test, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { buildGraph, relationshipTo } from "../../src/lib/friends";
import { FriendScope, type FriendScopedCache } from "../../src/lib/friendScope";

const graph = (following: string[], followers: string[]) => buildGraph(new Set(following), new Set(followers));

function fakeCache() {
  const events: string[] = [];
  const cache: FriendScopedCache = {
    evictAuthor: (uid) => events.push(`evict:${uid}`),
    clear: () => events.push("clear"),
  };
  return { cache, events };
}

describe("buildGraph", () => {
  test("classifies friends, incoming and outgoing", () => {
    const g = graph(["bob", "carol"], ["bob", "dave"]);
    expect([...g.friends]).toEqual(["bob"]);
    expect([...g.outgoing]).toEqual(["carol"]);
    expect([...g.incoming]).toEqual(["dave"]);
    expect(relationshipTo(g, "me", "me")).toBe("self");
    expect(relationshipTo(g, "me", "bob")).toBe("friend");
    expect(relationshipTo(g, "me", "carol")).toBe("outgoing");
    expect(relationshipTo(g, "me", "dave")).toBe("incoming");
    expect(relationshipTo(g, "me", "erin")).toBe("none");
  });
});

describe("FriendScope", () => {
  const scope = () => new FriendScope({} as Firestore, "me");

  test("evicts a friend from every cache the moment they leave the friend set", () => {
    const s = scope();
    const a = fakeCache();
    const b = fakeCache();
    s.register(a.cache);
    s.register(b.cache);
    s.apply(graph(["bob", "carol"], ["bob", "carol"]));
    expect(a.events).toEqual([]);

    // Bob unfriends me (deletes his edge): he's now only "outgoing".
    s.apply(graph(["bob", "carol"], ["carol"]));
    expect(a.events).toEqual(["evict:bob"]);
    expect(b.events).toEqual(["evict:bob"]);
    expect(s.isFriend("bob")).toBe(false);
    expect(s.isFriend("carol")).toBe(true);
  });

  test("evicts before UI listeners hear about the change", () => {
    const s = scope();
    const order: string[] = [];
    s.register({ evictAuthor: (u) => order.push(`evict:${u}`), clear: () => {} });
    s.apply(graph(["bob"], ["bob"]));
    s.subscribe(() => order.push("ui"));
    order.length = 0;
    s.apply(graph([], []));
    expect(order).toEqual(["evict:bob", "ui"]);
  });

  test("new friends and pending requests evict nothing", () => {
    const s = scope();
    const a = fakeCache();
    s.register(a.cache);
    s.apply(graph(["bob"], []));
    s.apply(graph(["bob"], ["bob", "dave"]));
    expect(a.events).toEqual([]);
  });

  test("stop() (sign-out) clears every cache and resets state", () => {
    const s = scope();
    const a = fakeCache();
    const seen = vi.fn();
    s.register(a.cache);
    s.apply(graph(["bob"], ["bob"]));
    s.subscribe(seen);
    s.stop();
    expect(a.events).toEqual(["clear"]);
    expect(s.current.friends.size).toBe(0);
    expect(s.isLoaded).toBe(false);
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ friends: new Set() }));
  });

  test("unregistered caches are no longer touched", () => {
    const s = scope();
    const a = fakeCache();
    const unregister = s.register(a.cache);
    s.apply(graph(["bob"], ["bob"]));
    unregister();
    s.apply(graph([], []));
    expect(a.events).toEqual([]);
  });
});
