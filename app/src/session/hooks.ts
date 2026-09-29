import { useEffect, useState } from "react";
import { db } from "../firebase";
import { watchMyPosts, type Post } from "../lib/posts";
import { PhotoEvictedError } from "../lib/photoCache";
import { watchLatestPrompt, type Prompt } from "../lib/prompts";
import { getPassage, type Passage } from "../lib/scripture/text";
import { DEFAULT_TRANSLATION } from "../lib/scripture/translations";
import { watchSettings, type Settings } from "../lib/settings";
import { useReadySession } from "./SessionProvider";

export function useLatestPrompt(): { prompt: Prompt | null; loaded: boolean } {
  const [state, setState] = useState<{ prompt: Prompt | null; loaded: boolean }>({ prompt: null, loaded: false });
  useEffect(() => watchLatestPrompt(db, (prompt) => setState({ prompt, loaded: true })), []);
  return state;
}

export function useMyPosts(): { posts: Post[]; loaded: boolean } {
  const { profile } = useReadySession();
  const [state, setState] = useState<{ posts: Post[]; loaded: boolean }>({ posts: [], loaded: false });
  useEffect(() => watchMyPosts(db, profile.uid, (posts) => setState({ posts, loaded: true })), [profile.uid]);
  return state;
}

export function useFeed(): Post[] {
  const { feed } = useReadySession();
  const [posts, setPosts] = useState<Post[]>(feed.posts);
  useEffect(() => feed.subscribe(setPosts), [feed]);
  return posts;
}

/**
 * A post photo as an in-memory data URI, loaded through the Storage rules.
 * Other people's photos only load while they're a friend.
 */
export function usePhoto(path: string | null, authorId: string): string | null {
  const { photos, scope, profile } = useReadySession();
  const [uri, setUri] = useState<string | null>(() => (path ? photos.peek(path) ?? null : null));
  useEffect(() => {
    if (!path) return;
    if (authorId !== profile.uid && !scope.isFriend(authorId)) return;
    let live = true;
    photos.get(path).then(
      (u) => { if (live) setUri(u); },
      (err) => { if (!(err instanceof PhotoEvictedError)) console.warn("photo failed", err); },
    );
    return () => { live = false; };
  }, [path, authorId, photos, scope, profile.uid]);
  return uri;
}

/** The current time, refreshed every `intervalMs`. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// One shared settings listener per signed-in user, however many components
// (e.g. every verse on screen) ask for settings.
const settingsStore = {
  uid: null as string | null,
  value: { bibleVersion: DEFAULT_TRANSLATION } as Settings,
  listeners: new Set<(s: Settings) => void>(),
  unsubscribe: null as null | (() => void),
};

function subscribeSettings(uid: string, listener: (s: Settings) => void): () => void {
  if (settingsStore.uid !== uid) {
    settingsStore.unsubscribe?.();
    settingsStore.uid = uid;
    settingsStore.value = { bibleVersion: DEFAULT_TRANSLATION };
    settingsStore.unsubscribe = watchSettings(db, uid, (s) => {
      settingsStore.value = s;
      for (const l of settingsStore.listeners) l(s);
    });
  }
  settingsStore.listeners.add(listener);
  listener(settingsStore.value);
  return () => {
    settingsStore.listeners.delete(listener);
    if (settingsStore.listeners.size === 0) {
      settingsStore.unsubscribe?.();
      settingsStore.unsubscribe = null;
      settingsStore.uid = null;
    }
  };
}

export function useSettings(): Settings {
  const { profile } = useReadySession();
  const [settings, setSettings] = useState<Settings>(settingsStore.value);
  useEffect(() => subscribeSettings(profile.uid, setSettings), [profile.uid]);
  return settings;
}

// Public-domain scripture text is not user content, so caching it is fine.
const passages = new Map<string, Promise<Passage>>();

/**
 * The text of a verse reference in the viewer's own translation setting.
 * Only the reference is stored anywhere; the text is produced here, per viewer.
 */
export function usePassage(refId: string | null): { passage: Passage | null; failed: boolean } {
  const { bibleVersion } = useSettings();
  const key = refId ? `${bibleVersion}:${refId}` : null;
  const [state, setState] = useState<{ key: string | null; passage: Passage | null; failed: boolean }>({ key: null, passage: null, failed: false });
  useEffect(() => {
    if (!key || !refId) return;
    let live = true;
    if (!passages.has(key)) passages.set(key, getPassage(refId, bibleVersion));
    passages.get(key)!.then(
      (passage) => { if (live) setState({ key, passage, failed: false }); },
      (err) => {
        passages.delete(key);
        console.warn("verse unavailable", refId, err);
        if (live) setState({ key, passage: null, failed: true });
      },
    );
    return () => { live = false; };
  }, [key, refId, bibleVersion]);
  return state.key === key ? { passage: state.passage, failed: state.failed } : { passage: null, failed: false };
}
