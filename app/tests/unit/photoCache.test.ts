import { describe, expect, test } from "vitest";
import { authorOfPhotoPath, ownerOfAvatarPath, PhotoCache, PhotoEvictedError } from "../../src/lib/photoCache";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

function controlledLoader() {
  const calls: string[] = [];
  const pending = new Map<string, (b: ArrayBuffer) => void>();
  const load = (path: string) => {
    calls.push(path);
    return new Promise<ArrayBuffer>((resolve) => pending.set(path, resolve));
  };
  const finish = (path: string) => pending.get(path)!(bytes(path));
  return { load, calls, finish };
}

const instant = (path: string) => Promise.resolve(bytes(path));

describe("PhotoCache", () => {
  test("parses author from path and rejects anything else", () => {
    expect(authorOfPhotoPath("postPhotos/alice123/p1.jpg")).toBe("alice123");
    expect(() => authorOfPhotoPath("elsewhere/alice/p1.jpg")).toThrow();
    expect(() => authorOfPhotoPath("postPhotos/alice/../bob/p1.jpg")).toThrow();
  });

  test("returns a data URI and caches it in memory", async () => {
    let n = 0;
    const cache = new PhotoCache((p) => { n++; return instant(p); });
    const uri = await cache.get("postPhotos/alice/p1.jpg");
    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from("postPhotos/alice/p1.jpg").toString("base64")}`);
    await cache.get("postPhotos/alice/p1.jpg");
    expect(n).toBe(1);
  });

  test("evictAuthor drops only that author's photos", async () => {
    const cache = new PhotoCache(instant);
    await cache.get("postPhotos/alice/a.jpg");
    await cache.get("postPhotos/bob/b.jpg");
    cache.evictAuthor("alice");
    expect(cache.peek("postPhotos/alice/a.jpg")).toBeUndefined();
    expect(cache.peek("postPhotos/bob/b.jpg")).toBeDefined();
  });

  test("a download in flight when the friend is removed is discarded, not shown", async () => {
    const loader = controlledLoader();
    const cache = new PhotoCache(loader.load);
    const result = cache.get("postPhotos/alice/a.jpg");
    cache.evictAuthor("alice");
    loader.finish("postPhotos/alice/a.jpg");
    await expect(result).rejects.toBeInstanceOf(PhotoEvictedError);
    expect(cache.size).toBe(0);
  });

  test("a download in flight at sign-out is discarded", async () => {
    const loader = controlledLoader();
    const cache = new PhotoCache(loader.load);
    const result = cache.get("postPhotos/bob/b.jpg");
    cache.clear();
    loader.finish("postPhotos/bob/b.jpg");
    await expect(result).rejects.toBeInstanceOf(PhotoEvictedError);
    expect(cache.size).toBe(0);
  });

  test("after eviction, the next request goes back to the server (rules re-checked)", async () => {
    const loader = controlledLoader();
    const cache = new PhotoCache(loader.load);
    const first = cache.get("postPhotos/alice/a.jpg");
    loader.finish("postPhotos/alice/a.jpg");
    await first;
    cache.evictAuthor("alice");
    const second = cache.get("postPhotos/alice/a.jpg");
    expect(loader.calls).toEqual(["postPhotos/alice/a.jpg", "postPhotos/alice/a.jpg"]);
    loader.finish("postPhotos/alice/a.jpg");
    await second;
  });

  test("bounded size, least recently used goes first", async () => {
    const cache = new PhotoCache(instant, 2);
    await cache.get("postPhotos/a/1.jpg");
    await cache.get("postPhotos/a/2.jpg");
    await cache.get("postPhotos/a/1.jpg"); // touch 1
    await cache.get("postPhotos/a/3.jpg");
    expect(cache.peek("postPhotos/a/2.jpg")).toBeUndefined();
    expect(cache.peek("postPhotos/a/1.jpg")).toBeDefined();
    expect(cache.size).toBe(2);
  });
});

describe("profile photo cache", () => {
  test("parses the owner from an avatar path and rejects anything else", () => {
    expect(ownerOfAvatarPath("avatars/alice123/a1.jpg")).toBe("alice123");
    expect(() => ownerOfAvatarPath("postPhotos/alice/a1.jpg")).toThrow();
    expect(() => ownerOfAvatarPath("avatars/alice/../bob/a1.jpg")).toThrow();
  });

  test("a cache built for avatars accepts avatar paths and refuses post photos", async () => {
    const cache = new PhotoCache(instant, 10, ownerOfAvatarPath);
    await cache.get("avatars/alice/a1.jpg");
    expect(cache.peek("avatars/alice/a1.jpg")).toBeDefined();
    await expect(cache.get("postPhotos/alice/p1.jpg")).rejects.toThrow();
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
