import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth, db, storage } from "../firebase";
import { ActivityStore } from "../lib/activity";
import { FeedStore } from "../lib/feed";
import { EMPTY_GRAPH, type FriendGraph } from "../lib/friends";
import { FriendScope } from "../lib/friendScope";
import { ownerOfAvatarPath, PhotoCache, storageLoader } from "../lib/photoCache";
import { profileFromData, type Profile } from "../lib/profile";

type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "needsProfile"; user: User }
  | { status: "ready"; user: User; profile: Profile; scope: FriendScope; photos: PhotoCache; avatars: PhotoCache; feed: FeedStore; activity: ActivityStore };

const SessionContext = createContext<Session>({ status: "loading" });

// A name offered by Apple/Google at sign-in, used to prefill onboarding.
let suggestedDisplayName: string | null = null;
export const setSuggestedDisplayName = (name: string | null) => { suggestedDisplayName = name; };
export const getSuggestedDisplayName = () => suggestedDisplayName;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // Tagged with the uid it belongs to, so a stale profile from a previous
  // account is never shown for the next one.
  const [profileState, setProfileState] = useState<{ uid: string; profile: Profile | null } | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Watch my own profile doc, so finishing onboarding moves straight on.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists()) return; // wait for the server
        const data = snap.data();
        setProfileState({ uid, profile: data ? profileFromData(uid, data) : null });
      },
      () => setProfileState({ uid, profile: null }),
    );
  }, [uid]);

  const profile = uid && profileState?.uid === uid ? profileState.profile : undefined;
  const hasProfile = !!profile;

  // One FriendScope per signed-in user, with every cache of other people's
  // content registered on it (photos, feed). Stopping the scope (sign-out or
  // switching accounts) clears all of them.
  const scoped = useMemo(() => {
    if (!uid) return null;
    const scope = new FriendScope(db, uid);
    const photos = new PhotoCache(storageLoader(storage));
    scope.register(photos);
    const feed = new FeedStore(db, scope, { onError: (err) => console.warn("feed listener failed", err) });
    // Profile photos: visible to any signed-in user, so unfriending doesn't
    // evict them, but they're memory-only and cleared on sign-out like the rest.
    const avatars = new PhotoCache(storageLoader(storage), 200, ownerOfAvatarPath);
    scope.register({ evictAuthor: () => {}, clear: () => avatars.clear() });
    // Friends' posts, and comments/reactions on my posts, for the Activity list.
    const activity = new ActivityStore(db, scope, feed, (err) => console.warn("activity listener failed", err));
    return { scope, photos, avatars, feed, activity };
  }, [uid]);

  useEffect(() => {
    if (!scoped || !hasProfile) return;
    scoped.feed.start();
    scoped.activity.start();
    scoped.scope.start((err) => console.warn("friend graph listener failed", err));
    return () => {
      scoped.activity.stop();
      scoped.feed.stop();
      scoped.scope.stop();
    };
  }, [scoped, hasProfile]);

  const session: Session = useMemo(() => {
    if (user === undefined) return { status: "loading" };
    if (user === null) return { status: "signedOut" };
    if (profile === undefined || !scoped) return { status: "loading" };
    if (profile === null) return { status: "needsProfile", user };
    return { status: "ready", user, profile, ...scoped };
  }, [user, profile, scoped]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function useReadySession() {
  const s = useSession();
  if (s.status !== "ready") throw new Error("useReadySession used outside a signed-in screen");
  return s;
}

/** The live friend graph, re-rendering on every change. */
export function useFriendGraph(): { graph: FriendGraph; loaded: boolean } {
  const { scope } = useReadySession();
  const [state, setState] = useState({ graph: scope.isLoaded ? scope.current : EMPTY_GRAPH, loaded: scope.isLoaded });
  useEffect(() => scope.subscribe((graph) => setState({ graph, loaded: scope.isLoaded })), [scope]);
  return state;
}
