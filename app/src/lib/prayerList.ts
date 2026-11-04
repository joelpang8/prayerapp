import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection, deleteDoc, deleteField, doc, limit, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch,
  type Firestore, type Unsubscribe,
} from "firebase/firestore";

/**
 * "My prayer list" (Prayers tab): people and things I pray for, at
 * users/{me}/prayerList/{itemId}. Only mine: nobody else can read it
 * (firestore.rules). Names are typed in, never linked to anyone's account.
 * Each day the app suggests a few ("Pray for today"), so everyone comes up
 * about as often as I chose. Which ones I've prayed for today is kept on
 * this phone only and starts fresh each day: no streaks, nothing "missed".
 */

export type Often = "daily" | "weekly" | "monthly";
export const OFTEN: readonly Often[] = ["daily", "weekly", "monthly"];

/** The groups everyone starts with; stored as these keys, shown translated. Others are my own words. */
export const PRESET_GROUPS = ["family", "friends", "church", "world"] as const;

export const NAME_MAX = 60;
export const NOTE_MAX = 200;
export const GROUP_MAX = 30;
export const ANSWER_NOTE_MAX = 120;
/** Plenty for a personal list. */
export const LIST_LIMIT = 500;

export type PrayerItem = {
  id: string;
  name: string;
  note: string;
  group: string;
  often: Often;
  order: number;
  createdAt: Date | null;
  answered: { at: Date; note: string } | null;
};

export type ItemInput = { name: string; note: string; group: string; often: Often };

const listRef = (db: Firestore, uid: string) => collection(db, "users", uid, "prayerList");

export function parseItem(id: string, d: Record<string, unknown>): PrayerItem | null {
  if (typeof d.name !== "string" || typeof d.group !== "string" || !OFTEN.includes(d.often as Often)) return null;
  const at = d.answeredAt instanceof Timestamp ? d.answeredAt.toDate() : null;
  return {
    id,
    name: d.name,
    note: typeof d.note === "string" ? d.note : "",
    group: d.group,
    often: d.often as Often,
    order: typeof d.order === "number" ? d.order : 0,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    answered: at ? { at, note: typeof d.answerNote === "string" ? d.answerNote : "" } : null,
  };
}

/** My list, live. */
export function watchPrayerList(db: Firestore, uid: string, onItems: (items: PrayerItem[]) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(
    query(listRef(db, uid), limit(LIST_LIMIT)),
    (snap) => onItems(snap.docs.map((d) => parseItem(d.id, d.data({ serverTimestamps: "estimate" }))).filter((x): x is PrayerItem => !!x)),
    onError,
  );
}

/** What's wrong with an entry, if anything. */
export function itemProblem(input: ItemInput): "name" | "nameLong" | "noteLong" | "group" | null {
  if (!input.name.trim()) return "name";
  if (input.name.trim().length > NAME_MAX) return "nameLong";
  if (input.note.trim().length > NOTE_MAX) return "noteLong";
  if (!input.group.trim() || input.group.trim().length > GROUP_MAX) return "group";
  return null;
}

const clean = (input: ItemInput) => ({ name: input.name.trim(), note: input.note.trim(), group: input.group.trim(), often: input.often });

/** Adds to the end of the list. */
export async function addItem(db: Firestore, uid: string, input: ItemInput, items: readonly PrayerItem[]): Promise<string> {
  const ref = doc(listRef(db, uid));
  const order = items.reduce((m, i) => Math.max(m, i.order + 1), 0);
  await setDoc(ref, { ...clean(input), order, createdAt: serverTimestamp() });
  return ref.id;
}

export function editItem(db: Firestore, uid: string, id: string, input: ItemInput): Promise<void> {
  return updateDoc(doc(listRef(db, uid), id), clean(input));
}

export function setAnswered(db: Firestore, uid: string, id: string, answered: boolean, note = ""): Promise<void> {
  const ref = doc(listRef(db, uid), id);
  if (!answered) return updateDoc(ref, { answeredAt: deleteField(), answerNote: deleteField() });
  const n = note.trim().slice(0, ANSWER_NOTE_MAX);
  return updateDoc(ref, { answeredAt: Timestamp.now(), ...(n ? { answerNote: n } : { answerNote: deleteField() }) });
}

export function removeItem(db: Firestore, uid: string, id: string): Promise<void> {
  return deleteDoc(doc(listRef(db, uid), id));
}

/** Swaps two items' places in the list. */
export async function swapOrder(db: Firestore, uid: string, a: PrayerItem, b: PrayerItem): Promise<void> {
  const batch = writeBatch(db);
  // Equal orders (shouldn't happen) still end up distinct.
  const [oa, ob] = a.order === b.order ? [b.order + 1, a.order] : [b.order, a.order];
  batch.update(doc(listRef(db, uid), a.id), { order: oa });
  batch.update(doc(listRef(db, uid), b.id), { order: ob });
  await batch.commit();
}

const byOrder = (a: PrayerItem, b: PrayerItem) => a.order - b.order || a.id.localeCompare(b.id);
const byCreated = (a: PrayerItem, b: PrayerItem) =>
  (a.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);

export type ListGroup = { group: string; items: PrayerItem[] };

/** Open items by group (the presets first, then mine A to Z), each in my order; answered ones separately, newest first. */
export function arrangeList(items: readonly PrayerItem[]): { groups: ListGroup[]; answered: PrayerItem[] } {
  const open = items.filter((i) => !i.answered);
  const names = [...new Set(open.map((i) => i.group))].sort((a, b) => {
    const pa = PRESET_GROUPS.indexOf(a as (typeof PRESET_GROUPS)[number]);
    const pb = PRESET_GROUPS.indexOf(b as (typeof PRESET_GROUPS)[number]);
    if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return a.localeCompare(b);
  });
  return {
    groups: names.map((group) => ({ group, items: open.filter((i) => i.group === group).sort(byOrder) })),
    answered: items.filter((i) => i.answered).sort((a, b) => b.answered!.at.getTime() - a.answered!.at.getTime()),
  };
}

/** My own group names (not the presets), for picking again. */
export function customGroups(items: readonly PrayerItem[]): string[] {
  return [...new Set(items.map((i) => i.group))].filter((g) => !(PRESET_GROUPS as readonly string[]).includes(g)).sort((a, b) => a.localeCompare(b));
}

/** Days since 1970 for an app day id ("20261104"). */
function dayNumber(dayId: string): number {
  return Math.floor(Date.UTC(Number(dayId.slice(0, 4)), Number(dayId.slice(4, 6)) - 1, Number(dayId.slice(6, 8))) / 86_400_000);
}

/**
 * Today's few (the app's day, America/New_York). "Every day" ones always;
 * the weekly ones are spread evenly over the 7 days and the monthly ones over
 * 30, in the order they were added, so everyone comes up as often as chosen
 * and the same ones show all day. Answered ones never.
 */
export function todaysPicks(items: readonly PrayerItem[], dayId: string): PrayerItem[] {
  const day = dayNumber(dayId);
  const open = items.filter((i) => !i.answered);
  const spread = (often: Often, every: number) =>
    open.filter((i) => i.often === often).sort(byCreated).filter((_, n) => n % every === day % every);
  return [...open.filter((i) => i.often === "daily").sort(byOrder), ...spread("weekly", 7), ...spread("monthly", 30)];
}

/* ---------- "✓ Prayed" today, on this phone only ---------- */

export const prayedKey = (uid: string) => `prayerListPrayed.${uid}`;

/** Today's prayed ids from what's stored; anything from another day is gone. */
export function prayedToday(stored: string | null, dayId: string): string[] {
  try {
    const v = JSON.parse(stored ?? "null") as { day?: unknown; ids?: unknown } | null;
    return v && v.day === dayId && Array.isArray(v.ids) ? v.ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadPrayed(uid: string, dayId: string): Promise<string[]> {
  return prayedToday(await AsyncStorage.getItem(prayedKey(uid)).catch(() => null), dayId);
}

export async function savePrayed(uid: string, dayId: string, ids: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(prayedKey(uid), JSON.stringify({ day: dayId, ids })).catch(() => {});
}
