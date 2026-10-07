import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text, TextInput } from "../../components/ui";
import { db } from "../../firebase";
import { addComment, canDeleteComment, deleteComment, MAX_COMMENT, type Comment } from "../../lib/comments";
import type { Profile } from "../../lib/profile";
import { reactionInfo } from "../../lib/reactions";
import { useComments, useFeed, useMyPosts, useReactions } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

function when(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * One prayer with its comments. The post comes from what's already on the
 * device (my posts, or the friend feed), so a post from someone who's no
 * longer a friend simply isn't found.
 */
export default function PostScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useReadySession();
  const feed = useFeed();
  const { posts: mine, loaded } = useMyPosts();
  const post = mine.find((p) => p.id === id) ?? feed.find((p) => p.id === id);
  const comments = useComments(post?.id ?? null, post?.authorId ?? null);
  const reactions = useReactions(post?.id ?? null, post?.authorId ?? null);
  const people = useProfiles(
    new Set([post?.authorId, ...comments.map((c) => c.authorId), ...reactions.map((r) => r.authorId)].filter((u): u is string => !!u && u !== me.uid)),
  );
  const profileOf = (uid: string): Profile | undefined => (uid === me.uid ? me : people.get(uid));

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!post) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{loaded && <Muted>This prayer isn&apos;t available any more.</Muted>}</View>
      </View>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await addComment(db, post!.id, me.uid, text);
      setText("");
    } catch (err) {
      console.warn("comment failed", err);
      setError("Couldn't send your comment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(c: Comment) {
    Alert.alert("Delete this comment?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteComment(db, post!.id, c.id).catch(() => Alert.alert("Couldn't delete", "Please try again.")),
      },
    ]);
  }

  const isMine = post.authorId === me.uid;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PostCard post={post} author={profileOf(post.authorId)} commentsLink={false} footer={isMine ? <OwnPostActions post={post} /> : undefined} />

        {reactions.length > 0 && (
          <>
            <SectionTitle>Reactions</SectionTitle>
            {reactions.map((r) => {
              const who = profileOf(r.authorId);
              const info = reactionInfo(r.kind);
              return (
                <View key={r.authorId} style={styles.reaction}>
                  <Text style={styles.reactionEmoji}>{info.emoji}</Text>
                  <Text style={styles.commentName} numberOfLines={1}>{who?.displayName ?? "…"}</Text>
                  <Text style={styles.commentTime}>{info.label}</Text>
                </View>
              );
            })}
          </>
        )}

        {post.visibility === "private" ? (
          <Muted>This prayer is private: only you can see it.</Muted>
        ) : (
          <>
          <SectionTitle>Comments</SectionTitle>
          {comments.length === 0 && <Muted>No comments yet.</Muted>}
          {comments.map((c) => {
            const who = profileOf(c.authorId);
            return (
              <View key={c.id} style={styles.comment}>
                <Pressable onPress={() => router.push(`/profile/${c.authorId}`)} accessibilityRole="link" accessibilityLabel={`${who?.displayName ?? ""}'s profile`}>
                  <Avatar path={who?.avatarPath ?? null} name={who?.displayName ?? ""} size={32} />
                </Pressable>
                <View style={styles.commentBody}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentName} numberOfLines={1}>{who?.displayName ?? "…"}</Text>
                    <Text style={styles.commentTime}>{when(c.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentText}>{c.text}</Text>
                  {canDeleteComment(me.uid, post.authorId, c) && (
                    <Pressable onPress={() => confirmDelete(c)} accessibilityRole="button" style={styles.deleteLink}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
          <Muted>Each comment and reaction is shown only to people who are friends with the person who wrote it.</Muted>
  
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a comment"
              multiline
              maxLength={MAX_COMMENT}
              style={styles.input}
            />
            <Button title="Send" onPress={send} busy={busy} disabled={!text.trim()} />
          </View>
          {error && <ErrorText>{error}</ErrorText>}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  comment: { flexDirection: "row", gap: 10, paddingVertical: 6 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  reactionEmoji: { fontSize: 22, width: 32, textAlign: "center" },
  commentBody: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  commentName: { fontSize: 18, fontFamily: fonts.display, color: colors.text, flexShrink: 1 },
  commentTime: { fontSize: 13, color: colors.muted },
  commentText: { fontSize: 17, lineHeight: 24, color: colors.text },
  deleteLink: { alignSelf: "flex-start", paddingVertical: 2 },
  deleteText: { fontSize: 14, color: colors.danger },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
}));
