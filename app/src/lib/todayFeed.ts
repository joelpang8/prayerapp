import type { Post } from "./posts";

/**
 * Today shows friends' prayers for the latest prompt ("today's"); earlier
 * ones wait behind "See earlier prayers". With no prompt yet, everything
 * counts as today's so the page isn't empty. Pure, for tests.
 */
export function splitFeed<P extends Pick<Post, "promptId">>(feed: readonly P[], promptId: string | null): { today: P[]; earlier: P[] } {
  if (!promptId) return { today: [...feed], earlier: [] };
  return { today: feed.filter((p) => p.promptId === promptId), earlier: feed.filter((p) => p.promptId !== promptId) };
}
