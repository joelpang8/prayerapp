import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { Button, colors, Muted, SectionTitle } from "../../components/ui";
import { VerseBlock } from "../../components/VerseBlock";
import { ON_TIME_WINDOW_MS } from "../../lib/posts";
import { useFeed, useLatestPrompt, useMyPosts, useNow } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

const OPEN_FOR_MS = 24 * 60 * 60 * 1000; // must match firestore.rules

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function TodayScreen() {
  const { profile } = useReadySession();
  const { prompt, loaded } = useLatestPrompt();
  const { posts: mine } = useMyPosts();
  const feed = useFeed();
  const names = useProfiles(new Set(feed.map((p) => p.authorId)));

  const myPost = prompt ? mine.find((p) => p.promptId === prompt.id) : undefined;
  const now = useNow();
  const open = prompt && now - prompt.firedAt.getTime() < OPEN_FOR_MS;
  const onTimeUntil = prompt ? new Date(prompt.firedAt.getTime() + ON_TIME_WINDOW_MS) : null;
  // Today's verse is shown at the top while the prompt is open or I've posted.
  const promptVerseShown = !!prompt?.verseRef && (!!myPost || !!open);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {!loaded ? null : myPost ? (
        <>
          {prompt?.verseRef && (
            <View style={styles.verse}>
              <VerseBlock refId={prompt.verseRef} />
            </View>
          )}
          <SectionTitle>Your prayer today</SectionTitle>
          <PostCard post={myPost} authorName={profile.displayName} footer={<OwnPostActions post={myPost} />} showVerse={false} />
        </>
      ) : open && onTimeUntil ? (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>Time to pray</Text>
          {prompt!.verseRef && <VerseBlock refId={prompt!.verseRef} />}
          <Muted>
            {now <= onTimeUntil.getTime()
              ? `The prompt went out at ${time(prompt!.firedAt)}. Post by ${time(onTimeUntil)} to be on time.`
              : `The prompt went out at ${time(prompt!.firedAt)}. You can still post; it will be marked late.`}
          </Muted>
          <Button title="Pray now" onPress={() => router.push("/compose")} />
        </View>
      ) : (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>No prompt yet</Text>
          <Muted>Once a day, at a random moment, everyone is asked to pray right then.</Muted>
        </View>
      )}

      <SectionTitle>Friends</SectionTitle>
      {feed.length === 0 && <Muted>Nothing from friends yet.</Muted>}
      {feed.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          authorName={names.get(post.authorId)?.displayName ?? "…"}
          // Don't repeat the verse already shown at the top; older posts keep theirs.
          showVerse={!(promptVerseShown && post.verseRef === prompt?.verseRef)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  prompt: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  promptTitle: { fontSize: 22, fontWeight: "700", color: colors.text },
  verse: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
});
