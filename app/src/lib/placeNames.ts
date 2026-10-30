/** Names for a typed place, best first, without repeats ("austin" -> "Austin, Texas"). */
export function uniquePlaceNames(names: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const n of names) if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  return out;
}
