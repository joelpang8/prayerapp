import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { fonts, makeStyles, Text } from "../components/ui";
import { timeAgo, type Activity } from "../lib/activity";
import { reactionInfo } from "../lib/reactions";
import { useActivity, useNow } from "../session/hooks";
import { useProfiles } from "../session/useProfiles";
import { t } from "../i18n";

function describe(a: Activity, name: string): string {
  switch (a.kind) {
    case "posted":
      return t("activity.prayed", { name });
    case "answered":
      return a.text ? t("activity.answeredWithText", { name, text: a.text }) : t("activity.answered", { name });
    case "commented":
      return t("activity.commented", { name, text: a.text ?? "" });
    case "reacted": {
      const r = reactionInfo(a.reaction!);
      return t("activity.reacted", { name, emoji: r.emoji, label: r.label });
    }
  }
}

/**
 * What friends have done in the last week: prayed, had a prayer answered,
 * or commented on or reacted to mine. Only current friends.
 */
export default function ActivityScreen() {
  const styles = useStyles();
  const { items, markSeen } = useActivity();
  const names = useProfiles(new Set(items.map((a) => a.actorId)));
  const now = useNow(60_000);
  useEffect(() => { markSeen(); }, [markSeen, items.length]);

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(a) => a.id}
      ListEmptyComponent={<EmptyState icon="leaf-outline" title={t("activity.emptyTitle")} message={t("activity.emptyBody")} />}
      renderItem={({ item }) => {
        const who = names.get(item.actorId);
        return (
          <Pressable onPress={() => router.push(`/post/${item.postId}`)} style={styles.row} accessibilityRole="link">
            <Avatar path={who?.avatarPath ?? null} name={who?.displayName ?? ""} size={40} />
            <View style={styles.body}>
              <Text style={styles.text} numberOfLines={3}>{describe(item, who?.displayName ?? t("activity.aFriend"))}</Text>
              <Text style={styles.time}>{timeAgo(item.at, new Date(now))}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 16, lineHeight: 23, color: colors.text },
  time: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
}));
