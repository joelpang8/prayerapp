import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";
import type { FriendScope } from "./friendScope";
import { PostThread } from "./postThread";

export const MAX_COMMENT = 500; // must match firestore.rules

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: Date;
};

export function commentProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Write something first.";
  if (trimmed.length > MAX_COMMENT) return `At most ${MAX_COMMENT} characters.`;
  return null;
}

const commentsOf = (db: Firestore, postId: string) => collection(db, "posts", postId, "comments");

export async function addComment(db: Firestore, postId: string, uid: string, text: string): Promise<void> {
  const problem = commentProblem(text);
  if (problem) throw new Error(problem);
  await addDoc(commentsOf(db, postId), { authorId: uid, text: text.trim(), createdAt: serverTimestamp() });
}

/** Allowed for the comment's author and the post's author (enforced by the rules). */
export function deleteComment(db: Firestore, postId: string, commentId: string): Promise<void> {
  return deleteDoc(doc(commentsOf(db, postId), commentId));
}

/** Whether `me` may delete `comment` on a post by `postAuthorId`. */
export const canDeleteComment = (me: string, postAuthorId: string, comment: Pick<Comment, "authorId">) =>
  comment.authorId === me || postAuthorId === me;

/** One post's comments, live, oldest first (see PostThread). */
export class CommentThread extends PostThread<Comment> {
  constructor(
    db: Firestore,
    scope: FriendScope,
    post: { id: string; authorId: string },
    options: { chunkSize?: number; onError?: (err: Error) => void } = {},
  ) {
    super(db, scope, post, "comments", (id, data: DocumentData) => ({
      id,
      postId: post.id,
      authorId: data.authorId,
      text: data.text,
      createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? new Date(),
    }), options);
  }

  get comments(): Comment[] {
    return this.items;
  }
}
