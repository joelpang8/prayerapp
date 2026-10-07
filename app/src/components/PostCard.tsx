import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { isLate, type Post } from "../lib/posts";
import type { Profile } from "../lib/profile";
import { usePhoto } from "../session/hooks";
import { Avatar } from "./Avatar";
import { ReactionBar } from "./ReactionBar";
import { fonts, makeStyles, Text, useColors } from "./ui";
import { VerseBlock } from "./VerseBlock";

const day = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function when(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PostCard({
  post,
  author,
  footer,
  showVerse = true,
  commentsLink = true,
  collapsed = false,
  onToggleCollapsed,
}: {
  post: Post;
  /** Undefined while the author's profile is loading. */
  author: Profile | undefined;
  footer?: React.ReactNode;
  /** Off when the same verse is already shown above (e.g. under today's prompt). */
  showVerse?: boolean;
  /** Off on the post's own page, which shows the comments itself. */
  commentsLink?: boolean;
  /** Friends' posts in the feed can be shrunk to one line. */
  collapsed?: boolean;
  /** Shows the collapse chevron when set. */
  onToggleCollapsed?: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  // Not loaded while collapsed: nothing to show it in.
  const uri = usePhoto(collapsed ? null : post.photoPath, post.authorId);
  const late = isLate(post);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={author ? `${author.displayName}'s profile` : undefined}
          onPress={() => router.push(`/profile/${post.authorId}`)}
          style={styles.who}
        >
          <Avatar path={author?.avatarPath ?? null} name={author?.displayName ?? ""} size={36} />
          <Text style={styles.author} numberOfLines={1}>{author?.displayName ?? "…"}</Text>
        </Pressable>
        <Text style={styles.meta}>{when(post.createdAt)}</Text>
        {onToggleCollapsed && (
          <Pressable
            onPress={onToggleCollapsed}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? "Show this prayer" : "Minimize this prayer"}
            hitSlop={10}
          >
            <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {collapsed && (
        <Pressable onPress={onToggleCollapsed} accessibilityRole="button" accessibilityLabel="Show this prayer">
          <Text style={styles.preview} numberOfLines={1}>
            {post.answeredAt ? "Answered · " : ""}{post.notes}
          </Text>
        </Pressable>
      )}
      {!collapsed && expanded()}
    </View>
  );

  // A plain function, not a component, so the verse's open/closed state
  // survives re-renders.
  function expanded() {
    return (
      <>
      {post.place && <Text style={styles.place}>📍 {post.place}</Text>}
      <View style={styles.labels}>
        {post.visibility === "private" && <Text style={[styles.label, styles.answered]}>🔒 Private</Text>}
        {post.answeredAt && <Text style={[styles.label, styles.answered]}>Answered</Text>}
        {late && <Text style={[styles.label, styles.late]}>Late</Text>}
        {/* Sent later from the offline queue: show when it was really taken. */}
        {post.takenAt && post.createdAt.getTime() - post.takenAt.getTime() > 60_000 && (
          <Text style={styles.label}>Taken {post.takenAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
        )}
        {post.editedAt && <Text style={styles.label}>Edited</Text>}
      </View>
      <View style={styles.photo}>
        {uri ? (
          // cachePolicy "none": the decoded photo only lives in PhotoCache
          // (memory), never in expo-image's disk cache.
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
      <Text style={styles.notes}>{post.notes}</Text>
      {post.answeredAt && (
        <View style={styles.answer}>
          <Text style={styles.answerTitle}>Answered · {day(post.answeredAt)}</Text>
          {post.answerNote && <Text style={styles.answerNote}>{post.answerNote}</Text>}
        </View>
      )}
      {showVerse && post.verseRef && <VerseBlock refId={post.verseRef} collapsed />}
      {/* Private posts are for the author alone: no reactions or comments. */}
      {post.visibility === "friends" && <ReactionBar post={post} />}
      {commentsLink && post.visibility === "friends" && (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/post/${post.id}`)} style={styles.commentsLink}>
          <Text style={styles.commentsText}>Comments</Text>
        </Pressable>
      )}
      {footer}
      </>
    );
  }
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  author: { fontSize: 21, fontFamily: fonts.display, color: colors.text, flexShrink: 1 },
  meta: { fontSize: 14, color: colors.muted },
  place: { fontSize: 15, color: colors.muted },
  commentsLink: { alignSelf: "flex-start", paddingVertical: 6 },
  commentsText: { fontSize: 16, fontFamily: fonts.serifSemiBold, color: colors.accent },
  labels: { flexDirection: "row", gap: 6 },
  label: { fontSize: 13, color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  late: { color: colors.muted },
  answered: { color: colors.accent, borderColor: colors.accent },
  answer: { backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12, gap: 4 },
  answerTitle: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent },
  answerNote: { fontSize: 17, lineHeight: 24, fontFamily: fonts.serifItalic, color: colors.text },
  preview: { fontSize: 16, color: colors.muted },
  photo: { aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.bg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  notes: { fontSize: 18, lineHeight: 26, fontFamily: fonts.serif, color: colors.text },
}));
