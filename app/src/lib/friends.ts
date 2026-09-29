import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

/**
 * The signed-in user's view of the follow graph.
 *   friends:  both directions exist
 *   incoming: they follow me, I don't follow them (requests to answer)
 *   outgoing: I follow them, they don't follow me (requests I've sent)
 */
export type FriendGraph = {
  friends: ReadonlySet<string>;
  incoming: ReadonlySet<string>;
  outgoing: ReadonlySet<string>;
};

export type Relationship = "self" | "friend" | "incoming" | "outgoing" | "none";

export const EMPTY_GRAPH: FriendGraph = {
  friends: new Set(),
  incoming: new Set(),
  outgoing: new Set(),
};

export function buildGraph(following: ReadonlySet<string>, followers: ReadonlySet<string>): FriendGraph {
  const friends = new Set<string>();
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const uid of following) (followers.has(uid) ? friends : outgoing).add(uid);
  for (const uid of followers) if (!following.has(uid)) incoming.add(uid);
  return { friends, incoming, outgoing };
}

export function relationshipTo(graph: FriendGraph, me: string, other: string): Relationship {
  if (other === me) return "self";
  if (graph.friends.has(other)) return "friend";
  if (graph.incoming.has(other)) return "incoming";
  if (graph.outgoing.has(other)) return "outgoing";
  return "none";
}

const edge = (db: Firestore, followerId: string, followeeId: string) =>
  doc(db, "follows", `${followerId}_${followeeId}`);

/**
 * Live friend graph from the server, from ONE query covering both
 * directions: each snapshot is a consistent view, so an atomic change (like
 * removeFriend's batch) never shows up half-applied, e.g. as a friend
 * briefly turning into a "request".
 * Cache-sourced snapshots are ignored: friendship state must come from the
 * server, because that's what the rules enforce.
 */
export function watchFriendGraph(
  db: Firestore,
  me: string,
  onGraph: (graph: FriendGraph) => void,
  onError: (err: Error) => void = () => {},
): Unsubscribe {
  const mine = query(
    collection(db, "follows"),
    or(where("followerId", "==", me), where("followeeId", "==", me)),
  );
  return onSnapshot(
    mine,
    (snap) => {
      if (snap.metadata.fromCache) return;
      const following = new Set<string>();
      const followers = new Set<string>();
      for (const d of snap.docs) {
        const { followerId, followeeId } = d.data() as { followerId: string; followeeId: string };
        if (followerId === me) following.add(followeeId);
        if (followeeId === me) followers.add(followerId);
      }
      onGraph(buildGraph(following, followers));
    },
    onError,
  );
}

/** Send a request, or accept one if they already follow me. */
export function follow(db: Firestore, me: string, them: string): Promise<void> {
  return setDoc(edge(db, me, them), { followerId: me, followeeId: them, createdAt: serverTimestamp() });
}

export const acceptRequest = follow;

export function declineRequest(db: Firestore, me: string, them: string): Promise<void> {
  return deleteDoc(edge(db, them, me));
}

export function cancelRequest(db: Firestore, me: string, them: string): Promise<void> {
  return deleteDoc(edge(db, me, them));
}

/**
 * The rules deny deleting a follow edge that doesn't exist (there's no
 * resource to check the parties on), so for an edge the caller is a party
 * to, permission-denied means "already gone".
 */
async function deleteEdgeIfPresent(db: Firestore, followerId: string, followeeId: string) {
  try {
    await deleteDoc(edge(db, followerId, followeeId));
  } catch (err) {
    if ((err as { code?: string }).code !== "permission-denied") throw err;
  }
}

/**
 * Removes both edges in one atomic batch, so the other person never sees a
 * half-removed state (which would look like a pending request). Either edge
 * alone revokes post access; removing both means neither side is left with
 * a request that could be accepted by accident later.
 *
 * If the batch is refused because an edge is already gone (the other person
 * removed at the same moment), fall back to deleting whatever is left.
 */
export async function removeFriend(db: Firestore, me: string, them: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(edge(db, me, them));
  batch.delete(edge(db, them, me));
  try {
    await batch.commit();
  } catch (err) {
    if ((err as { code?: string }).code !== "permission-denied") throw err;
    await deleteEdgeIfPresent(db, me, them);
    await deleteEdgeIfPresent(db, them, me);
  }
}
