import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { isLate, type Post } from "../lib/posts";
import type { Profile } from "../lib/profile";
import { usePhoto } from "../session/hooks";
import { Avatar } from "./Avatar";
import { colors, fonts } from "./ui";
import { VerseBlock } from "./VerseBlock";

function when(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PostCard({
  post,
  author,
  footer,
  showVerse = true,
}: {
  post: Post;
  /** Undefined while the author's profile is loading. */
  author: Profile | undefined;
  footer?: React.ReactNode;
  /** Off when the same verse is already shown above (e.g. under today's prompt). */
  showVerse?: boolean;
}) {
  const uri = usePhoto(post.photoPath, post.authorId);
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
      </View>
      <View style={styles.labels}>
        {late && <Text style={[styles.label, styles.late]}>Late</Text>}
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
      {showVerse && post.verseRef && <VerseBlock refId={post.verseRef} collapsed />}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  author: { fontSize: 21, fontFamily: fonts.display, color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
  labels: { flexDirection: "row", gap: 6 },
  label: { fontSize: 12, color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  late: { color: colors.muted },
  photo: { aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.bg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  notes: { fontSize: 18, lineHeight: 26, fontFamily: fonts.serif, color: colors.text },
});
