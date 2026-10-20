import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import { REF_ID_PATTERN } from "./scripture/reference";

/**
 * Scripture memory: verses I've saved to read or listen to again, at
 * users/{me}/savedVerses/{refId}. Only mine; friends never see them. Only
 * the reference is stored, never the text (the app shows it in my own
 * translation). The doc id is the reference, so a verse is saved once.
 */

export type SavedVerse = { refId: string; savedAt: Date | null };

/** How many the list shows; plenty for a personal list. */
export const SAVED_VERSES_LIMIT = 500;

const savedRef = (db: Firestore, uid: string, refId: string) => {
  if (!REF_ID_PATTERN.test(refId)) throw new Error(`Not a verse reference: "${refId}".`);
  return doc(db, "users", uid, "savedVerses", refId);
};

export function saveVerse(db: Firestore, uid: string, refId: string): Promise<void> {
  return setDoc(savedRef(db, uid, refId), { verseRef: refId, savedAt: serverTimestamp() });
}

export function unsaveVerse(db: Firestore, uid: string, refId: string): Promise<void> {
  return deleteDoc(savedRef(db, uid, refId));
}

/** My saved verses, most recently saved first, live. */
export function watchSavedVerses(
  db: Firestore,
  uid: string,
  onVerses: (verses: SavedVerse[]) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "users", uid, "savedVerses"), orderBy("savedAt", "desc"), limit(SAVED_VERSES_LIMIT)),
    // A just-saved verse has no server time yet: an estimate keeps it at the top.
    (snap) => onVerses(
      snap.docs
        .filter((d) => REF_ID_PATTERN.test(d.id))
        .map((d) => ({ refId: d.id, savedAt: d.data({ serverTimestamps: "estimate" }).savedAt?.toDate?.() ?? null })),
    ),
    onError,
  );
}
