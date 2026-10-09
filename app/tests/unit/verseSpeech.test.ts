import { describe, expect, test } from "vitest";
import { getPassage } from "../../src/lib/scripture/text";
import { spokenPassage, spokenReference, VerseSpeaker, type SpeechDeps } from "../../src/lib/verseSpeech";

describe("what Listen says", () => {
  test("references read naturally", () => {
    expect(spokenReference("PSA.145.18")).toBe("Psalm 145, verse 18");
    expect(spokenReference("PHP.4.6-7")).toBe("Philippians 4, verses 6 to 7");
    expect(spokenReference("JHN.3.16-4.2")).toBe("John 3, verse 16, to chapter 4, verse 2");
    expect(spokenReference("PSA.23")).toBe("Psalm 23");
    expect(spokenReference("1JN.1.9")).toBe("First John 1, verse 9");
    expect(spokenReference("2KI.6.17")).toBe("Second Kings 6, verse 17");
    expect(spokenReference("3JN.1.2")).toBe("Third John 1, verse 2");
  });

  test("the verse text only: no brackets, no verse numbers, capitals read as words", async () => {
    const said = spokenPassage(await getPassage("PSA.145.18", "KJV"));
    expect(said).toBe("Psalm 145, verse 18. The Lord is nigh unto all them that call upon him, to all that call upon him in truth.");
    const two = spokenPassage(await getPassage("PHP.4.6-7", "KJV"));
    const [reference, ...verse] = two.split(". ");
    expect(reference).toBe("Philippians 4, verses 6 to 7");
    expect(verse.join(". ")).not.toMatch(/[[\]\d]/);
    expect(verse.join(". ").startsWith("Be careful for nothing")).toBe(true);
  });
});

function fakeDeps() {
  const log: string[] = [];
  let callbacks: { onDone: () => void; onStopped: () => void; onError: () => void } | null = null;
  const deps: SpeechDeps = {
    speak: (text, cb) => { log.push(`speak:${text}`); callbacks = cb; },
    stop: () => { log.push("stop"); callbacks?.onStopped(); },
    beginAudio: async () => { log.push("begin"); },
    endAudio: async () => { log.push("end"); },
  };
  return { deps, log, done: () => callbacks?.onDone() };
}

describe("the speaker", () => {
  test("plays only when started, and puts the audio session back when done", async () => {
    const f = fakeDeps();
    const s = new VerseSpeaker(f.deps);
    expect(f.log).toEqual([]);
    await s.start("a", "Psalm 23. The Lord is my shepherd");
    expect(s.speaking).toBe("a");
    expect(f.log).toEqual(["begin", "speak:Psalm 23. The Lord is my shepherd"]);
    f.done();
    expect(s.speaking).toBeNull();
    await Promise.resolve();
    expect(f.log.at(-1)).toBe("end");
  });

  test("one verse at a time: starting another stops the first", async () => {
    const f = fakeDeps();
    const s = new VerseSpeaker(f.deps);
    const seen: (string | null)[] = [];
    s.subscribe((id) => seen.push(id));
    await s.start("a", "one");
    await s.start("b", "two");
    expect(s.speaking).toBe("b");
    expect(seen).toEqual(["a", null, "b"]);
    expect(f.log.filter((l) => l === "stop")).toHaveLength(1);
  });

  test("closing a screen stops only its own verse", async () => {
    const f = fakeDeps();
    const s = new VerseSpeaker(f.deps);
    await s.start("a", "one");
    await s.stopIf("b");
    expect(s.speaking).toBe("a");
    await s.stopIf("a");
    expect(s.speaking).toBeNull();
    expect(f.log).toContain("end");
  });

  test("stopping when nothing plays does nothing", async () => {
    const f = fakeDeps();
    await new VerseSpeaker(f.deps).stop();
    expect(f.log).toEqual([]);
  });

  test("if the silent-mode switch-over fails, it still reads", async () => {
    const f = fakeDeps();
    f.deps.beginAudio = async () => { throw new Error("no session"); };
    const s = new VerseSpeaker(f.deps);
    await s.start("a", "one");
    expect(f.log).toEqual(["speak:one"]);
  });
});
