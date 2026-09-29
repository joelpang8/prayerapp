import { useEffect, useState } from "react";
import { db } from "../firebase";
import { watchMyPosts, type Post } from "../lib/posts";
import { PhotoEvictedError } from "../lib/photoCache";
import { watchLatestPrompt, type Prompt } from "../lib/prompts";
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
