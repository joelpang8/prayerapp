/**
 * Special days, worked out from the prompt's id (its date in New York), the
 * same way as the server (firebase/functions/src/dailyPrompt.ts occasionFor).
 * Thanksgiving (US, the fourth Thursday of November): Today says "Time to
 * give thanks" and the posting screen asks what you're thankful for.
 * Wording only: nothing is stored or added to posts.
 */
export type Occasion = "thanksgiving";

export function occasionFor(promptId: string | null | undefined): Occasion | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(promptId ?? "");
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month !== 11) return null;
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return day === firstThursday + 21 ? "thanksgiving" : null;
}
