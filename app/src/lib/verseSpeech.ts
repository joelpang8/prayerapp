import { bookById, parseRefId } from "./scripture/reference";
import { plainText, type Passage } from "./scripture/text";

/**
 * "Listen": reads a verse aloud with the phone's own text-to-speech
 * (expo-speech; no server). This file holds the pure parts (what to say)
 * and a small controller with its native calls passed in, so it can be
 * tested without a phone. The app wires it up in session/useVerseSpeech.ts.
 */

const ORDINALS: Record<string, string> = { "1": "First", "2": "Second", "3": "Third" };

/** "1 John" -> "First John"; Psalms is read "Psalm" for one psalm. */
function spokenBook(bookId: string, oneChapter: boolean): string {
  const name = bookById(bookId)?.name ?? bookId;
  if (bookId === "PSA" && oneChapter) return "Psalm";
  return name.replace(/^([123]) /, (_, n: string) => `${ORDINALS[n]} `);
}

/**
 * The reference as it's said aloud: "Psalm 145, verse 18",
 * "Philippians 4, verses 6 to 7", "John 3, verse 16, to chapter 4, verse 2",
 * "Psalm 23".
 */
export function spokenReference(refId: string): string {
  const r = parseRefId(refId);
  const book = spokenBook(r.book, r.startChapter === r.endChapter);
  if (r.wholeChapter) return `${book} ${r.startChapter}`;
  if (r.startChapter === r.endChapter) {
    return r.startVerse === r.endVerse
      ? `${book} ${r.startChapter}, verse ${r.startVerse}`
      : `${book} ${r.startChapter}, verses ${r.startVerse} to ${r.endVerse}`;
  }
  return `${book} ${r.startChapter}, verse ${r.startVerse}, to chapter ${r.endChapter}, verse ${r.endVerse}`;
}

/**
 * KJV capitals (LORD, GOD, JESUS) are for the eye; some voices spell them
 * out letter by letter, so they're read as ordinary words.
 */
function forSpeech(text: string): string {
  return text.replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/\s{2,}/g, " ").trim();
}

/** What's read: the reference, then the verse text only (no brackets, no verse numbers). */
export function spokenPassage(passage: Pick<Passage, "refId" | "verses">): string {
  const text = passage.verses.map((v) => plainText(v.segments)).join(" ");
  return `${spokenReference(passage.refId)}. ${forSpeech(text)}`;
}

export type SpeechDeps = {
  speak(text: string, callbacks: { onDone: () => void; onStopped: () => void; onError: () => void }): void;
  stop(): Promise<void> | void;
  /** Let speech play with the silent switch on, pausing other audio, only while reading. */
  beginAudio(): Promise<void>;
  /** Put the audio session back and let other apps' audio resume. */
  endAudio(): Promise<void>;
};

/**
 * One verse at a time, app-wide. Starting another stops the first. Nothing
 * plays unless start() is called from a tap.
 */
export class VerseSpeaker {
  private current: string | null = null;
  private readonly listeners = new Set<(id: string | null) => void>();

  constructor(private readonly deps: SpeechDeps) {}

  get speaking(): string | null {
    return this.current;
  }

  subscribe(listener: (id: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(id: string, text: string): Promise<void> {
    if (this.current) await this.stop();
    this.set(id);
    try {
      await this.deps.beginAudio();
    } catch {
      // Still read it; it just follows the silent switch.
    }
    if (this.current !== id) return; // stopped while the audio session was changing
    const finished = () => {
      if (this.current !== id) return;
      this.set(null);
      void this.deps.endAudio().catch(() => {});
    };
    this.deps.speak(text, { onDone: finished, onStopped: finished, onError: finished });
  }

  /** Stop whatever is playing (a tap, the screen closing, the app leaving the foreground). */
  async stop(): Promise<void> {
    if (!this.current) return;
    this.set(null);
    await this.deps.stop();
    await this.deps.endAudio().catch(() => {});
  }

  /** Stop only if `id` is the one playing (its screen is closing). */
  stopIf(id: string): Promise<void> {
    return this.current === id ? this.stop() : Promise.resolve();
  }

  private set(id: string | null) {
    this.current = id;
    for (const l of this.listeners) l(id);
  }
}
