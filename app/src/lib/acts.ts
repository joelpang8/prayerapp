/**
 * An optional helper for writing a prayer, sometimes called ACTS:
 * adoration, confession, thanksgiving, supplication. Shown in plain words.
 * It only shows hints while writing: nothing about it is stored, and posts
 * are the same with or without it.
 */
export type ActsStep = { id: "praise" | "sorry" | "thanks" | "asking"; label: string; hint: string };

export const ACTS_STEPS: readonly ActsStep[] = [
  { id: "praise", label: "Praise", hint: "What do you love about God today?" },
  { id: "sorry", label: "Sorry", hint: "Is there anything you'd like to put right?" },
  { id: "thanks", label: "Thanks", hint: "What are you grateful for?" },
  { id: "asking", label: "Asking", hint: "What do you need, for yourself or someone else?" },
];

/** A hint shows from the tap until the notes change (they've started typing). */
export function hintVisible(shown: { notesAtTap: string } | null, notes: string): boolean {
  return !!shown && shown.notesAtTap === notes;
}
