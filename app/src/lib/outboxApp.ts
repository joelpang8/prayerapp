import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import { photoBlob } from "./capture";
import { Outbox, type QueuedPost } from "./outbox";
import { createPost } from "./posts";

const key = (uid: string) => `outbox.${uid}`;

/** The outbox, saved in the app's own storage and sending through Firebase. */
export function createOutbox(db: Firestore, storage: FirebaseStorage, uid: string): Outbox {
  return new Outbox(
    uid,
    {
      load: async (u) => JSON.parse((await AsyncStorage.getItem(key(u))) ?? "[]") as QueuedPost[],
      save: async (u, items) => {
        if (items.length) await AsyncStorage.setItem(key(u), JSON.stringify(items));
        else await AsyncStorage.removeItem(key(u));
      },
    },
    {
      exists: async (postId) => {
        try {
          return (await getDoc(doc(db, "posts", postId))).exists();
        } catch (err) {
          // The id is always my own post's. If it existed I could read it, so
          // a refusal means it isn't there (the rules refuse reading a
          // missing doc). Anything else (e.g. offline) is passed on.
          if ((err as { code?: string }).code === "permission-denied") return false;
          throw err;
        }
      },
      send: async (q) => {
        await createPost(db, storage, {
          uid: q.uid,
          prompt: { id: q.prompt.id, firedAt: new Date(q.prompt.firedAt), verseRef: q.prompt.verseRef },
          notes: q.notes,
          jpeg: await photoBlob(q.photoUri),
          photoId: q.photoId,
          place: q.place,
          visibility: q.visibility,
          takenAt: new Date(q.takenAt),
        });
      },
    },
  );
}
