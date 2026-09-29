import { doc, onSnapshot, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { DEFAULT_TRANSLATION, isTranslationId, type TranslationId } from "./scripture/translations";

export type Settings = { bibleVersion: TranslationId };

const settingsDoc = (db: Firestore, uid: string) => doc(db, "users", uid, "private", "settings");

/**
 * My settings, live. A missing doc, or a translation no longer offered,
 * falls back to the default (KJV).
 */
export function watchSettings(
  db: Firestore,
  uid: string,
  onSettings: (settings: Settings) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  return onSnapshot(
    settingsDoc(db, uid),
    (snap) => {
      const v = snap.data()?.bibleVersion;
      onSettings({ bibleVersion: isTranslationId(v) ? v : DEFAULT_TRANSLATION });
    },
    onError,
  );
}

export function setBibleVersion(db: Firestore, uid: string, bibleVersion: TranslationId): Promise<void> {
  return setDoc(settingsDoc(db, uid), { bibleVersion });
}
