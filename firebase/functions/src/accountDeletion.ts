/**
 * Deleting an account: everything the person put in the app goes, and
 * nothing of anyone else's. Called by the deleteAccount function (index.ts)
 * after the person confirmed and signed in again.
 *
 * Removes: their posts (with every comment and reaction on them) and photos,
 * including private ones; their comments and reactions on other people's
 * posts; their "I'll pray for this" taps, given and received; follows and
 * blocks in both directions; their prayer-circle requests, "I prayed" marks,
 * invitations and memberships (a circle they lead passes to its next
 * member, or is deleted if they were alone); their profile, bio and details, settings,
 * hidden list, verse index and username; reports they filed; their profile
 * photo; and finally the sign-in account itself. Reports filed ABOUT them by
 * others are kept for moderation, with the quoted excerpt of their words
 * removed.
 *
 * Plain parameters (not module singletons) so it can be tested against the
 * emulators.
 */
import type { DocumentReference, Firestore, Query } from "firebase-admin/firestore";

export type DeletionDeps = {
  db: Firestore;
  deleteFiles: (prefix: string) => Promise<void>;
  deleteAuthUser: (uid: string) => Promise<void>;
};

export type DeletionSummary = Record<string, number>;

/** Signed in again within this long before deleting. */
export const RECENT_SIGN_IN_S = 5 * 60;

export function isRecentSignIn(authTimeS: number | undefined, nowMs = Date.now()): boolean {
  return typeof authTimeS === "number" && nowMs / 1000 - authTimeS <= RECENT_SIGN_IN_S && nowMs / 1000 - authTimeS >= -60;
}

async function deleteAll(q: Query, each?: (ref: DocumentReference) => Promise<void>): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await q.limit(300).get();
    if (snap.empty) return n;
    for (const d of snap.docs) {
      if (each) await each(d.ref);
      else await d.ref.delete();
      n++;
    }
  }
}

export async function deleteAccountData(uid: string, deps: DeletionDeps): Promise<DeletionSummary> {
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) throw new Error("bad uid");
  const { db } = deps;
  const summary: DeletionSummary = {};
  const userRef = db.doc(`users/${uid}`);
  const username = (await userRef.get()).get("username") as string | undefined;

  // The profile first: other functions (e.g. the verse index) check it to
  // know the account is going and must not recreate anything.
  await userRef.delete();

  // Their posts, each with all its comments and reactions.
  summary.posts = await deleteAll(db.collection("posts").where("authorId", "==", uid), (ref) => db.recursiveDelete(ref));
  // Their words and reactions on other people's posts, and taps they gave.
  summary.comments = await deleteAll(db.collectionGroup("comments").where("authorId", "==", uid));
  summary.reactions = await deleteAll(db.collectionGroup("reactions").where("authorId", "==", uid));
  summary.tapsGiven = await deleteAll(db.collectionGroup("prayingFor").where("friendUid", "==", uid));
  // Prayer circles: their requests and "I prayed" marks, invitations, and
  // memberships. A circle they lead goes to the next member, or is deleted
  // (with its requests) if nobody else is in it.
  summary.circleRequests = await deleteAll(db.collectionGroup("circleRequests").where("authorId", "==", uid));
  // Each list is rewritten without them, in a transaction so a concurrent
  // change (someone else praying or joining) isn't lost.
  const without = (ref: DocumentReference, field: string) =>
    db.runTransaction(async (tx) => {
      const list = ((await tx.get(ref)).get(field) ?? []) as string[];
      tx.update(ref, { [field]: list.filter((x) => x !== uid) });
    });
  const prayed = await db.collectionGroup("circleRequests").where("prayedBy", "array-contains", uid).get();
  for (const d of prayed.docs) await without(d.ref, "prayedBy");
  summary.circlePrayed = prayed.size;
  const invited = await db.collection("circles").where("invitedIds", "array-contains", uid).get();
  for (const d of invited.docs) await without(d.ref, "invitedIds");
  summary.circleInvites = invited.size;
  const circles = await db.collection("circles").where("memberIds", "array-contains", uid).get();
  for (const d of circles.docs) {
    const others = (d.get("memberIds") as string[]).filter((m) => m !== uid);
    if (d.get("leaderId") !== uid) await without(d.ref, "memberIds");
    else if (others.length > 0) await d.ref.update({ leaderId: others[0], memberIds: others });
    else {
      await db.recursiveDelete(d.ref);
      await deps.deleteFiles(`circlePhotos/${d.id}/`);
    }
  }
  summary.circles = circles.size;
  // Friendships, requests and blocks, both ways.
  summary.follows = (await deleteAll(db.collection("follows").where("followerId", "==", uid)))
    + (await deleteAll(db.collection("follows").where("followeeId", "==", uid)));
  summary.blocks = (await deleteAll(db.collection("blocks").where("blocker", "==", uid)))
    + (await deleteAll(db.collection("blocks").where("blocked", "==", uid)));
  // Reports: theirs go; reports about them stay for moderation, minus the quote.
  summary.reportsFiled = await deleteAll(db.collection("reports").where("reporter", "==", uid));
  const about = await db.collection("reports").where("targetUid", "==", uid).get();
  for (const d of about.docs) {
    if (d.get("excerpt") === undefined) continue;
    const { excerpt: _excerpt, ...rest } = d.data();
    await d.ref.set({ ...rest, excerptRemoved: "account deleted" });
  }
  summary.reportsRedacted = about.size;

  if (username) {
    const claim = db.doc(`usernames/${username}`);
    if ((await claim.get()).get("uid") === uid) await claim.delete();
  }
  // Everything under users/{uid}: friendsOnly, private (settings, verse
  // index), hidden, prayingFor (taps received). Last, in case a trigger
  // wrote something meanwhile.
  await db.recursiveDelete(userRef);

  for (const prefix of [`avatars/${uid}/`, `postPhotos/${uid}/`, `privatePhotos/${uid}/`]) await deps.deleteFiles(prefix);
  await deps.deleteAuthUser(uid);
  return summary;
}
