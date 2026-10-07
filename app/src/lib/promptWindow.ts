/**
 * The countdown after a prompt fires: 2 minutes to pray "right now", then a
 * 5-minute grace period that still counts as on time, then late. Measured
 * from the server's firedAt, so every phone shows the same time left (a
 * phone that opened late honestly sees less). On time vs late on a post is
 * still decided by the server (firestore.rules); this only shows it.
 *
 * Same logic as the step 4 prototype's promptWindow.ts, written separately:
 * the app doesn't import the prototype (CLAUDE.md).
 */
import { GRACE_MS, RESPOND_WINDOW_MS } from "./posts";

export type Phase = "respond" | "grace" | "late";

export type WindowState = {
  phase: Phase;
  /** ms until the current phase ends (0 once late). */
  msLeft: number;
  /** Share of the current phase still left, 1 → 0 (for a progress bar). */
  fractionLeft: number;
};

export function windowState(firedAtMs: number, nowMs: number, windowMs = RESPOND_WINDOW_MS, graceMs = GRACE_MS): WindowState {
  // A phone clock a little behind the server's shows the full window, not more.
  const elapsed = Math.max(0, nowMs - firedAtMs);
  if (elapsed < windowMs) return { phase: "respond", msLeft: windowMs - elapsed, fractionLeft: (windowMs - elapsed) / windowMs };
  if (elapsed < windowMs + graceMs) {
    const left = windowMs + graceMs - elapsed;
    return { phase: "grace", msLeft: left, fractionLeft: left / graceMs };
  }
  return { phase: "late", msLeft: 0, fractionLeft: 0 };
}

/** 103_000 -> "01:43". Rounds up, so "00:00" only shows when time is truly up. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
