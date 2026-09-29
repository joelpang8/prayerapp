/**
 * Countdown for a prompt, measured from the SERVER's firedAt (sent in the
 * push), never from when the push arrived. If a push is delayed, the user
 * sees less time left, which is the honest answer: on-time vs late is
 * decided by the server clock (see firestore.rules).
 *
 * To be moved into the main app when the prototype is proven.
 */
export type Phase = "respond" | "grace" | "late";

export type WindowState = {
  phase: Phase;
  /** ms until the current phase ends (0 once late) */
  msLeft: number;
  /** ms since the prompt fired (negative if the device clock is behind) */
  elapsed: number;
};

export function windowState(firedAtMs: number, nowMs: number, windowMs: number, graceMs: number): WindowState {
  const elapsed = nowMs - firedAtMs;
  if (elapsed < windowMs) return { phase: "respond", msLeft: windowMs - Math.max(0, elapsed), elapsed };
  if (elapsed < windowMs + graceMs) return { phase: "grace", msLeft: windowMs + graceMs - elapsed, elapsed };
  return { phase: "late", msLeft: 0, elapsed };
}

/** 125_000 -> "2:05"; rounds up so "0:00" only shows when time is truly up. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export type PromptPush = { promptId: string; firedAtMs: number; windowMs: number; graceMs: number; verseRef: string | null };

/** Parses the data payload built by notify-proto/src/message.ts; null if it isn't a prompt. */
export function parsePromptData(data: Record<string, unknown> | undefined): PromptPush | null {
  if (!data || data.kind !== "prompt") return null;
  const firedAtMs = Date.parse(String(data.firedAt));
  const windowMs = Number(data.windowMs);
  const graceMs = Number(data.graceMs);
  if (!Number.isFinite(firedAtMs) || !(windowMs > 0) || !(graceMs >= 0) || typeof data.promptId !== "string") return null;
  return { promptId: data.promptId, firedAtMs, windowMs, graceMs, verseRef: typeof data.verseRef === "string" ? data.verseRef : null };
}
