import { collection, limit, onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from "firebase/firestore";

/**
 * One global prompt per day (v1). Written by the server only.
 * verseRef: canonical reference id from the curated list, or null.
 */
export type Prompt = { id: string; firedAt: Date; verseRef: string | null };

/** The most recent prompt that has been sent, or null before the first one. */
export function watchLatestPrompt(
  db: Firestore,
  onPrompt: (prompt: Prompt | null) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "prompts"), orderBy("firedAt", "desc"), limit(1)),
    (snap) => {
      const d = snap.docs[0];
      onPrompt(d ? { id: d.id, firedAt: d.data().firedAt.toDate(), verseRef: d.data().verseRef ?? null } : null);
    },
    onError,
  );
}
