import { t } from "../i18n";
/**
 * An optional helper for writing a prayer, sometimes called ACTS:
 * adoration, confession, thanksgiving, supplication. Shown in plain words.
 * It only shows hints while writing: nothing about it is stored, and posts
 * are the same with or without it.
 */
export type ActsStep = { id: "praise" | "sorry" | "thanks" | "asking"; label: string; hint: string };

// Words in the app's language, read when shown.
export const ACTS_STEPS: readonly ActsStep[] = [
  { id: "praise", get label() { return t("acts.praise"); }, get hint() { return t("acts.praiseHint"); } },
  { id: "sorry", get label() { return t("acts.sorry"); }, get hint() { return t("acts.sorryHint"); } },
  { id: "thanks", get label() { return t("acts.thanks"); }, get hint() { return t("acts.thanksHint"); } },
  { id: "asking", get label() { return t("acts.asking"); }, get hint() { return t("acts.askingHint"); } },
];

/** A hint shows from the tap until the notes change (they've started typing). */
export function hintVisible(shown: { notesAtTap: string } | null, notes: string): boolean {
  return !!shown && shown.notesAtTap === notes;
}
