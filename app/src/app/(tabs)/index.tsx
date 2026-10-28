import { router, useScrollToTop } from "expo-router";
import { useState, useRef } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { BirthdayCard } from "../../components/BirthdayCard";
import { EmptyState } from "../../components/EmptyState";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { PromptCountdown } from "../../components/PromptCountdown";
import { OfflineBanner } from "../../components/OfflineBanner";
import { QueuedPostCard } from "../../components/QueuedPostCard";
import { Button, fonts, makeStyles, Muted, SectionTitle, Text, useColors } from "../../components/ui";
import { WordOfTheDay } from "../../components/WordOfTheDay";
import { setNotificationsEnabled, useNotificationPermission, useNotificationsEnabled } from "../../lib/notifications";
import { shareInvite } from "../../lib/invite";
import { ON_TIME_WINDOW_MS } from "../../lib/posts";
import { useFeed, useHidden, useLatestPrompt, useMyPosts, useNow, useOutbox } from "../../session/hooks";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { usePullToRefresh } from "../../session/usePullToRefresh";
import { useProfiles } from "../../session/useProfiles";
import { locale, t } from "../../i18n";

const OPEN_FOR_MS = 24 * 60 * 60 * 1000; // must match firestore.rules

const time = (d: Date) => d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });

export default function TodayScreen() {
  // Tapping this tab again scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const styles = useStyles();
  const colors = useColors();
  const pull = usePullToRefresh({ feed: true });
  const { profile } = useReadySession();
  const { graph, loaded: friendsLoaded } = useFriendGraph();
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
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.accent} />}
    >
      <OfflineBanner />
      {queued.filter((q) => q !== queuedForPrompt || !myPost).map((q) => (
        <View key={q.postId} style={styles.queued}><QueuedPostCard item={q} /></View>
      ))}
      {!loaded ? null : myPost ? (
        <>
          <SectionTitle>{t("today.yourPrayer")}</SectionTitle>
          <PostCard post={myPost} author={profile} footer={<OwnPostActions post={myPost} />} showVerse={false} />
        </>
      ) : queuedForPrompt ? null : open && onTimeUntil ? (
        <View style={styles.prompt}>
          <PromptCountdown firedAt={prompt!.firedAt} whenLate={<Text style={styles.promptTitle}>{t("today.timeToPray")}</Text>} />
          <Muted>
            {now <= onTimeUntil.getTime()
              ? t("today.wentOutOnTime", { sent: time(prompt!.firedAt), until: time(onTimeUntil) })
              : t("today.wentOutLate", { sent: time(prompt!.firedAt) })}
          </Muted>
          <Button title={t("today.prayNow")} size="large" onPress={() => router.push("/compose")} />
        </View>
      ) : (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>{t("today.noPrompt")}</Text>
          <Muted>{t("today.noPromptBody")}</Muted>
        </View>
      )}
      {promptVerseShown && (
        <View style={styles.wordOfTheDay}>
          <WordOfTheDay refId={prompt!.verseRef!} />
        </View>
      )}
      {notifications.status === "undetermined" && notificationsOn && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t("today.notifyTitle")}</Text>
          <Muted>{t("today.notifyBody")}</Muted>
          <Button title={t("today.turnOnNotifications")} onPress={notifications.request} />
          <Button title={t("today.notNow")} kind="secondary" onPress={() => setNotificationsEnabled(false)} />
        </View>
      )}

      <BirthdayCard now={now} />

      <View style={styles.friendsHeader}>
        <SectionTitle>{t("today.friends")}</SectionTitle>
        {feed.length > 0 && (
          <Pressable
            onPress={() => setCollapsed(allCollapsed ? new Set() : new Set(feed.map((p) => p.id)))}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.collapseAll}>{allCollapsed ? t("today.showAll") : t("today.minimizeAll")}</Text>
          </Pressable>
        )}
      </View>
      {feed.length === 0 && (friendsLoaded && graph.friends.size === 0 ? (
        // No friends yet: help them find some, right where the feed would be.
        <View style={styles.noFriends}>
          <EmptyState icon="people-outline" title={t("today.noFriendsTitle")} message={t("today.noFriendsBody")} />
          <Button title={t("profile.invite")} onPress={() => shareInvite(profile.username).catch(() => {})} />
          <Button title={t("today.findFriends")} kind="secondary" onPress={() => router.navigate("/friends")} />
        </View>
      ) : (
        <EmptyState icon="people-outline" title={t("today.emptyTitle")} message={t("today.emptyBody")} />
      ))}
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
  noFriends: { gap: 10, marginBottom: 8 },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  wordOfTheDay: { marginTop: 16 },
  queued: { marginBottom: 16 },
  friendsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  collapseAll: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent, marginTop: 24 },
  notice: { backgroundColor: colors.accentSoft, borderRadius: 16, padding: 16, gap: 10, marginTop: 16 },
  noticeTitle: { fontSize: 19, fontFamily: fonts.display, color: colors.text },
  prompt: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  promptTitle: { fontSize: 26, fontFamily: fonts.displayBold, color: colors.text },
}));
