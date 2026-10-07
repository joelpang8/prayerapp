import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { PromptCountdown } from "../../components/PromptCountdown";
import { QueuedPostCard } from "../../components/QueuedPostCard";
import { Button, fonts, makeStyles, Muted, SectionTitle, Text } from "../../components/ui";
import { WordOfTheDay } from "../../components/WordOfTheDay";
import { setNotificationsEnabled, useNotificationPermission, useNotificationsEnabled } from "../../lib/notifications";
import { ON_TIME_WINDOW_MS } from "../../lib/posts";
import { useFeed, useHidden, useLatestPrompt, useMyPosts, useNow, useOutbox } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

const OPEN_FOR_MS = 24 * 60 * 60 * 1000; // must match firestore.rules

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function TodayScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const { prompt, loaded } = useLatestPrompt();
  const { posts: mine } = useMyPosts();
  const { isHidden } = useHidden();
  // Prayers I've reported stay hidden from me.
  const feed = useFeed().filter((p) => !isHidden({ postId: p.id }));
  const notifications = useNotificationPermission();
  const notificationsOn = useNotificationsEnabled();
  // Friends' posts I've minimized. Memory only: forgotten when the app
  // closes or I sign out (nothing about other people's posts goes to disk).
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allCollapsed = feed.length > 0 && feed.every((p) => collapsed.has(p.id));
  const names = useProfiles(new Set(feed.map((p) => p.authorId)));

  const myPost = prompt ? mine.find((p) => p.promptId === prompt.id) : undefined;
  // My posts still waiting to send (no connection, or refused).
  const { items: queued } = useOutbox();
  const queuedForPrompt = prompt ? queued.find((q) => q.prompt.id === prompt.id) : undefined;
  const now = useNow();
  const open = prompt && now - prompt.firedAt.getTime() < OPEN_FOR_MS;
  const onTimeUntil = prompt ? new Date(prompt.firedAt.getTime() + ON_TIME_WINDOW_MS) : null;
  // Today's verse is shown at the top while the prompt is open or I've posted.
  const promptVerseShown = !!prompt?.verseRef && (!!myPost || !!open);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {queued.filter((q) => q !== queuedForPrompt || !myPost).map((q) => (
        <View key={q.postId} style={styles.queued}><QueuedPostCard item={q} /></View>
      ))}
      {!loaded ? null : myPost ? (
        <>
          <SectionTitle>Your prayer today</SectionTitle>
          <PostCard post={myPost} author={profile} footer={<OwnPostActions post={myPost} />} showVerse={false} />
        </>
      ) : queuedForPrompt ? null : open && onTimeUntil ? (
        <View style={styles.prompt}>
          <PromptCountdown firedAt={prompt!.firedAt} whenLate={<Text style={styles.promptTitle}>Time to pray</Text>} />
          <Muted>
            {now <= onTimeUntil.getTime()
              ? `The prompt went out at ${time(prompt!.firedAt)}. Post by ${time(onTimeUntil)} to be on time.`
              : `The prompt went out at ${time(prompt!.firedAt)}. You can still post; it will be marked late.`}
          </Muted>
          <Button title="Pray now" size="large" onPress={() => router.push("/compose")} />
        </View>
      ) : (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>No prompt yet</Text>
          <Muted>Once a day, at a random moment, everyone is asked to pray right then.</Muted>
        </View>
      )}
      {promptVerseShown && (
        <View style={styles.wordOfTheDay}>
          <WordOfTheDay refId={prompt!.verseRef!} />
        </View>
      )}
      {notifications.status === "undetermined" && notificationsOn && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Know when it&apos;s time to pray</Text>
          <Muted>Once a day, at a random moment, you&apos;ll get a notification. You&apos;ll have 2 minutes to pause and pray.</Muted>
          <Button title="Turn on notifications" onPress={notifications.request} />
          <Button title="Not now" kind="secondary" onPress={() => setNotificationsEnabled(false)} />
        </View>
      )}

      <View style={styles.friendsHeader}>
        <SectionTitle>Friends</SectionTitle>
        {feed.length > 0 && (
          <Pressable
            onPress={() => setCollapsed(allCollapsed ? new Set() : new Set(feed.map((p) => p.id)))}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.collapseAll}>{allCollapsed ? "Show all" : "Minimize all"}</Text>
          </Pressable>
        )}
      </View>
      {feed.length === 0 && <Muted>Nothing from friends yet.</Muted>}
      {feed.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          author={names.get(post.authorId)}
          // Don't repeat the verse already shown at the top; older posts keep theirs.
          showVerse={!(promptVerseShown && post.verseRef === prompt?.verseRef)}
          collapsed={collapsed.has(post.id)}
          onToggleCollapsed={() => toggle(post.id)}
        />
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  wordOfTheDay: { marginTop: 16 },
  queued: { marginBottom: 16 },
  friendsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  collapseAll: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent, marginTop: 24 },
  notice: { backgroundColor: colors.accentSoft, borderRadius: 16, padding: 16, gap: 10, marginTop: 16 },
  noticeTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  prompt: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  promptTitle: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.text },
}));
