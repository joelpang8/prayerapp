/** Calendar helpers for the Prayers tab. Months are 1–12; days are the phone's local dates. */

export type YearMonth = { year: number; month: number };

/** "2026-10-07" for a local date. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStart({ year, month }: YearMonth): Date {
  return new Date(year, month - 1, 1);
}

export function addMonths({ year, month }: YearMonth, n: number): YearMonth {
  const d = new Date(year, month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export const thisMonth = (now = new Date()): YearMonth => ({ year: now.getFullYear(), month: now.getMonth() + 1 });

/**
 * The month as weeks of 7 cells, Sunday first. Cells outside the month are
 * null; the last week is padded to 7.
 */
export function monthGrid(ym: YearMonth): (Date | null)[][] {
  const first = monthStart(ym);
  const days = new Date(ym.year, ym.month, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(ym.year, ym.month - 1, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthTitle(ym: YearMonth): string {
  return monthStart(ym).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
