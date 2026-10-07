import { describe, expect, test } from "vitest";
import { Outbox, isPermanent, type OutboxStorage, type QueuedPost } from "../../src/lib/outbox";

function memoryStorage(initial: QueuedPost[] = []): OutboxStorage & { saved: QueuedPost[] } {
  const s = {
    saved: initial,
    load: async () => s.saved,
    save: async (_uid: string, items: QueuedPost[]) => { s.saved = items; },
  };
  return s;
}

const item = (postId = "20261007_alice"): Omit<QueuedPost, "status" | "problem"> => ({
  postId, uid: "alice", prompt: { id: "20261007", firedAt: 1, verseRef: null }, notes: "n",
  photoUri: "file:///p.jpg", photoId: "p1", place: null, visibility: "friends", takenAt: 2,
});

const offline = Object.assign(new Error("offline"), { code: "unavailable" });
const denied = Object.assign(new Error("no"), { code: "permission-denied" });

describe("Outbox", () => {
  test("sends straight away when it can, and forgets the post once sent", async () => {
    const sent: string[] = [];
    const store = memoryStorage();
    const box = new Outbox("alice", store, { exists: async () => false, send: async (q) => { sent.push(q.postId); } });
    await box.enqueue(item());
    await box.flush();
    expect(sent).toEqual(["20261007_alice"]);
    expect(box.all).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  test("keeps a post that can't send yet (offline), saved on the phone, and sends it later", async () => {
    let online = false;
    const store = memoryStorage();
    const box = new Outbox("alice", store, { exists: async () => false, send: async () => { if (!online) throw offline; } });
    await box.enqueue(item());
    await box.flush();
    expect(box.all.map((i) => i.status)).toEqual(["waiting"]);
    expect(store.saved).toHaveLength(1);
    online = true;
    await box.flush();
    expect(box.all).toEqual([]);
  });

  test("survives the app closing: a fresh outbox loads it and sends it", async () => {
    const store = memoryStorage([{ ...item(), status: "sending" }]);
    const sent: string[] = [];
    const box = new Outbox("alice", store, { exists: async () => false, send: async (q) => { sent.push(q.postId); } });
    await box.flush();
    expect(sent).toEqual(["20261007_alice"]);
  });

  test("doesn't post twice if an earlier attempt already landed", async () => {
    const store = memoryStorage([{ ...item(), status: "waiting" }]);
    let sends = 0;
    const box = new Outbox("alice", store, { exists: async () => true, send: async () => { sends++; } });
    await box.flush();
    expect(sends).toBe(0);
    expect(box.all).toEqual([]);
  });

  test("a refused post (e.g. the prompt closed) stops retrying until Retry, and can be discarded", async () => {
    const store = memoryStorage();
    let attempts = 0;
    const box = new Outbox("alice", store, { exists: async () => false, send: async () => { attempts++; throw denied; } });
    await box.enqueue(item());
    await box.flush();
    expect(box.all[0]).toMatchObject({ status: "failed" });
    await box.flush();
    expect(attempts).toBe(1);
    await box.retry("20261007_alice");
    await box.flush();
    expect(attempts).toBe(2);
    await box.discard("20261007_alice");
    expect(box.all).toEqual([]);
  });

  test("one post per prompt: queuing again replaces the earlier one", async () => {
    const box = new Outbox("alice", memoryStorage(), { exists: async () => false, send: async () => { throw offline; } });
    await box.enqueue({ ...item(), notes: "first" });
    await box.enqueue({ ...item(), notes: "second" });
    expect(box.all.map((i) => i.notes)).toEqual(["second"]);
  });
});

test("which errors are worth retrying", () => {
  expect(isPermanent(offline)).toBeNull();
  expect(isPermanent({ code: "storage/retry-limit-exceeded" })).toBeNull();
  expect(isPermanent(denied)).toMatch(/24 hours/);
  expect(isPermanent({ code: "photo-missing" })).toMatch(/photo/);
});
