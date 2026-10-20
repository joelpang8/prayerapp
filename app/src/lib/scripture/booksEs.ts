/**
 * Spanish book names, as in the Reina-Valera (one psalm is "Salmo").
 * spoken: how a numbered book is read aloud ("Primera de Juan").
 */
export const BOOK_NAMES_ES: Record<string, string> = {
  GEN: "Génesis", EXO: "Éxodo", LEV: "Levítico", NUM: "Números", DEU: "Deuteronomio", JOS: "Josué", JDG: "Jueces", RUT: "Rut",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Reyes", "2KI": "2 Reyes", "1CH": "1 Crónicas", "2CH": "2 Crónicas",
  EZR: "Esdras", NEH: "Nehemías", EST: "Ester", JOB: "Job", PSA: "Salmos", PRO: "Proverbios", ECC: "Eclesiastés",
  SNG: "Cantares", ISA: "Isaías", JER: "Jeremías", LAM: "Lamentaciones", EZK: "Ezequiel", DAN: "Daniel", HOS: "Oseas",
  JOL: "Joel", AMO: "Amós", OBA: "Abdías", JON: "Jonás", MIC: "Miqueas", NAM: "Nahúm", HAB: "Habacuc", ZEP: "Sofonías",
  HAG: "Hageo", ZEC: "Zacarías", MAL: "Malaquías", MAT: "Mateo", MRK: "Marcos", LUK: "Lucas", JHN: "Juan", ACT: "Hechos",
  ROM: "Romanos", "1CO": "1 Corintios", "2CO": "2 Corintios", GAL: "Gálatas", EPH: "Efesios", PHP: "Filipenses",
  COL: "Colosenses", "1TH": "1 Tesalonicenses", "2TH": "2 Tesalonicenses", "1TI": "1 Timoteo", "2TI": "2 Timoteo",
  TIT: "Tito", PHM: "Filemón", HEB: "Hebreos", JAS: "Santiago", "1PE": "1 Pedro", "2PE": "2 Pedro", "1JN": "1 Juan",
  "2JN": "2 Juan", "3JN": "3 Juan", JUD: "Judas", REV: "Apocalipsis",
};

// Samuel, Reyes and Crónicas are books ("el primer libro"): masculine;
// the letters are "cartas": feminine. "1 Juan" is read "Primera de Juan".
const MASCULINE = new Set(["1SA", "2SA", "1KI", "2KI", "1CH", "2CH"]);
const ORDINALS_M: Record<string, string> = { "1": "Primero", "2": "Segundo", "3": "Tercero" };
const ORDINALS_F: Record<string, string> = { "1": "Primera", "2": "Segunda", "3": "Tercera" };

export function spokenBookEs(bookId: string): string {
  const name = BOOK_NAMES_ES[bookId] ?? bookId;
  const ordinals = MASCULINE.has(bookId) ? ORDINALS_M : ORDINALS_F;
  return name.replace(/^([123]) /, (_, n: string) => `${ordinals[n]} de `);
}
