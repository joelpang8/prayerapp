import type { CircleRequest } from "./circles";

/**
 * "A year in this circle": a keepsake page of the year's answered prayers,
 * for any current member. Shown live from Firestore like the rest of the
 * circle and printed with AirPrint (expo-print printAsync, which doesn't
 * write a file); the app never saves it. Requests from people I've blocked
 * or reported are left out, as everywhere in the circle. Pure, for tests.
 */
export type CircleYear = {
  year: number;
  /** Requests added this year. */
  requests: number;
  /** "I prayed" taps on this year's requests. */
  prayers: number;
  /** Answered this year, earliest first. */
  answered: CircleRequest[];
};

const inYear = (d: Date | null, year: number) => !!d && d.getFullYear() === year;

export function circleYear(created: readonly CircleRequest[], answered: readonly CircleRequest[], year: number): CircleYear {
  const made = created.filter((r) => inYear(r.createdAt, year));
  return {
    year,
    requests: made.length,
    prayers: made.reduce((n, r) => n + r.prayedBy.length, 0),
    answered: answered
      .filter((r) => inYear(r.answered?.at ?? null, year))
      .sort((a, b) => (a.answered!.at!.getTime() - b.answered!.at!.getTime())),
  };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The printed page. Every string comes in already worded (translated) or is the members' own words, escaped. */
export function circleYearHtml(input: {
  title: string;
  subtitle: string;
  stats: string;
  empty: string;
  items: { name: string; text: string; note: string; when: string }[];
}): string {
  const items = input.items.map((i) => `<li><p class="req">“${escape(i.text)}”</p><p class="who">${escape(i.name)} · ${escape(i.when)}</p>${
    i.note ? `<p class="ans">✦ ${escape(i.note)}</p>` : ""}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:15px/1.5 Georgia,serif;color:#1F1B16;margin:36px}
h1{font-size:26px;margin:0 0 4px}.sub{color:#6B645C;margin:0 0 6px}.stats{color:#5B4B8A;font-weight:bold;margin:0 0 22px}
ul{list-style:none;padding:0;margin:0}li{border-top:1px solid #E6E1DA;padding:12px 0;break-inside:avoid}
.req{margin:0}.who{margin:2px 0 0;color:#6B645C;font-size:13px}.ans{margin:6px 0 0;padding:6px 10px;background:#FBF3DF;border-left:3px solid #8A5F0E;border-radius:6px}
</style></head><body><h1>${escape(input.title)}</h1><p class="sub">${escape(input.subtitle)}</p><p class="stats">${escape(input.stats)}</p>${
    input.items.length ? `<ul>${items}</ul>` : `<p>${escape(input.empty)}</p>`}</body></html>`;
}
