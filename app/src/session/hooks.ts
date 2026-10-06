import { useCallback, useEffect, useState } from "react";
import { db } from "../firebase";
import { loadLastSeen, saveLastSeen, type Activity } from "../lib/activity";
import { CommentThread, type Comment } from "../lib/comments";
import { ReactionThread, type Reaction } from "../lib/reactions";
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

/**
 * A profile photo as an in-memory data URI. Profile photos are visible to
 * any signed-in user, so there's no friend check here; the Storage rules
 * still run on every fetch. Null while loading, or if there's no photo.
 */
export function useAvatar(path: string | null): string | null {
  const { avatars } = useReadySession();
  const [state, setState] = useState<{ path: string; uri: string } | null>(() => {
    const hit = path ? avatars.peek(path) : undefined;
    return path && hit ? { path, uri: hit } : null;
  });
  useEffect(() => {
    if (!path) return;
    let live = true;
    avatars.get(path).then(
      (uri) => { if (live) setState({ path, uri }); },
      (err) => {
        // A replaced photo is deleted, so an out-of-date profile can point
        // at a missing file for a moment. The initials show instead.
        if (!(err instanceof PhotoEvictedError) && err?.code !== "storage/object-not-found") console.warn("profile photo failed", err);
      },
    );
    return () => { live = false; };
  }, [path, avatars]);
  return state && state.path === path ? state.uri : null;
}

/**
 * A post's comments, live, while the calling screen is open. The thread is
 * registered with FriendScope (memory only) and torn down on unmount.
 */
export function useComments(postId: string | null, postAuthorId: string | null): Comment[] {
  const { scope } = useReadySession();
  const [comments, setComments] = useState<Comment[]>([]);
  useEffect(() => {
    if (!postId || !postAuthorId) return;
    const thread = new CommentThread(db, scope, { id: postId, authorId: postAuthorId }, {
      onError: (err) => console.warn("comments listener failed", err),
    });
    thread.start();
    const unsubscribe = thread.subscribe(setComments);
    return () => {
      unsubscribe();
      thread.stop();
      setComments([]);
    };
  }, [scope, postId, postAuthorId]);
  return comments;
}

/**
 * A post's reactions, live, while the calling card is on screen (and not
 * minimized: pass nulls then). Registered with FriendScope; memory only.
 */
export function useReactions(postId: string | null, postAuthorId: string | null): Reaction[] {
  const { scope } = useReadySession();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  useEffect(() => {
    if (!postId || !postAuthorId) return;
    const thread = new ReactionThread(db, scope, { id: postId, authorId: postAuthorId }, {
      onError: (err) => console.warn("reactions listener failed", err),
    });
    thread.start();
    const unsubscribe = thread.subscribe(setReactions);
    return () => {
      unsubscribe();
      thread.stop();
      setReactions([]);
    };
  }, [scope, postId, postAuthorId]);
  return reactions;
}

// When Activity was last opened, shared by the bell's count and the screen.
const lastSeenStore = { uid: "", at: 0, listeners: new Set<(at: number) => void>() };

/**
 * The Activity list, and how many items are new since I last opened it.
 * markSeen() is called when the Activity screen opens.
 */
export function useActivity(): { items: Activity[]; unseen: number; markSeen: () => void } {
  const { activity, profile } = useReadySession();
  const [items, setItems] = useState<Activity[]>(activity.items);
  const [lastSeen, setLastSeen] = useState(lastSeenStore.uid === profile.uid ? lastSeenStore.at : Number.MAX_SAFE_INTEGER);
  useEffect(() => activity.subscribe(setItems), [activity]);
  useEffect(() => {
    let live = true;
    lastSeenStore.listeners.add(setLastSeen);
    if (lastSeenStore.uid !== profile.uid) {
      loadLastSeen(profile.uid).then((at) => {
        lastSeenStore.uid = profile.uid;
        lastSeenStore.at = at;
        if (live) setLastSeen(at);
      });
    }
    return () => {
      live = false;
      lastSeenStore.listeners.delete(setLastSeen);
    };
  }, [profile.uid]);
  const markSeen = useCallback(() => {
    const now = Date.now();
    lastSeenStore.uid = profile.uid;
    lastSeenStore.at = now;
    saveLastSeen(profile.uid, now);
    for (const l of lastSeenStore.listeners) l(now);
  }, [profile.uid]);
  return { items, unseen: items.filter((a) => a.at.getTime() > lastSeen).length, markSeen };
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
