import { Redirect } from "expo-router";
import { prayNowTarget } from "../lib/prayShortcut";
import { useLatestPrompt, useMyPosts, useNow, useOutbox } from "../session/hooks";

/**
 * prayerapp://pray and the app icon's "Pray now": straight to the posting
 * screen while today's prompt is open and I haven't posted, otherwise Today.
 */
export default function PrayRoute() {
  const { prompt, loaded } = useLatestPrompt();
  const { posts, loaded: postsLoaded } = useMyPosts();
  const { items: queued } = useOutbox();
  const now = useNow();
  if (!loaded || !postsLoaded) return null;
  const posted = !!prompt && (posts.some((p) => p.promptId === prompt.id) || queued.some((q) => q.prompt.id === prompt.id));
  return <Redirect href={prayNowTarget({ prompt, posted, now })} />;
}
