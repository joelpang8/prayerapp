import { deleteDoc, doc, serverTimestamp, setDoc, type DocumentData, type Firestore, type Timestamp } from "firebase/firestore";
import type { FriendScope } from "./friendScope";
import { PostThread } from "./postThread";

/** The preset reactions, in display order. Ids must match firestore.rules. */
export const REACTIONS = [
  { kind: "praying", emoji: "🙏", label: "Praying for you" },
  { kind: "love", emoji: "❤️", label: "Love" },
  { kind: "happy", emoji: "😊", label: "Happy" },
  { kind: "amen", emoji: "🙌", label: "Amen" },
  { kind: "cool", emoji: "😎", label: "Cool" },
  { kind: "hug", emoji: "🤗", label: "Hugs" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];

export type Reaction = { postId: string; authorId: string; kind: ReactionKind; createdAt: Date };

export const reactionInfo = (kind: ReactionKind) => REACTIONS.find((r) => r.kind === kind)!;

const isKind = (k: unknown): k is ReactionKind => REACTIONS.some((r) => r.kind === k);

/** One reaction per person: the doc id is the reactor's uid. Writing again changes it. */
export function react(db: Firestore, postId: string, uid: string, kind: ReactionKind): Promise<void> {
  return setDoc(doc(db, "posts", postId, "reactions", uid), { authorId: uid, kind, createdAt: serverTimestamp() });
}

export function unreact(db: Firestore, postId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, "posts", postId, "reactions", uid));
}

/** Count per kind, in REACTIONS order, leaving out kinds nobody used. */
export function summarize(reactions: readonly Reaction[]): { kind: ReactionKind; emoji: string; count: number }[] {
  return REACTIONS.map((r) => ({ kind: r.kind, emoji: r.emoji, count: reactions.filter((x) => x.kind === r.kind).length }))
    .filter((r) => r.count > 0);
}

/**
 * A post's reactions, live (see PostThread): mine and my current friends',
 * memory only, dropped the moment a friendship ends.
 */
export class ReactionThread extends PostThread<Reaction> {
  constructor(
    db: Firestore,
    scope: FriendScope,
    post: { id: string; authorId: string },
    options: { chunkSize?: number; onError?: (err: Error) => void } = {},
  ) {
    super(db, scope, post, "reactions", (_id, data: DocumentData) =>
      isKind(data.kind)
        ? { postId: post.id, authorId: data.authorId, kind: data.kind, createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? new Date() }
        : null, options);
  }
}
