import { useState } from "react";
import { useReadySession } from "./SessionProvider";

const MIN_SPIN_MS = 600;

/**
 * Pull to refresh. Everything on screen is already live, so this re-opens
 * the friends' feed (`feed: true`) and retries any posts waiting to send;
 * the spinner shows briefly so the pull feels answered.
 */
export function usePullToRefresh({ feed: withFeed = false }: { feed?: boolean } = {}): { refreshing: boolean; onRefresh: () => void } {
  const { feed, outbox } = useReadySession();
  const [refreshing, setRefreshing] = useState(false);
  function onRefresh() {
    setRefreshing(true);
    if (withFeed) feed.refresh();
    Promise.all([outbox.flush().catch(() => {}), new Promise((r) => setTimeout(r, MIN_SPIN_MS))]).finally(() => setRefreshing(false));
  }
  return { refreshing, onRefresh };
}
