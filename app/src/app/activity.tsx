import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { fonts, makeStyles, Muted, Text } from "../components/ui";
import { timeAgo, type Activity } from "../lib/activity";
import { reactionInfo } from "../lib/reactions";
import { useActivity, useNow } from "../session/hooks";
import { useProfiles } from "../session/useProfiles";

function describe(a: Activity, name: string): string {
  switch (a.kind) {
    case "posted":
      return `${name} prayed`;
    case "answered":
      return `${name}'s prayer was answered${a.text ? `: “${a.text}”` : ""}`;
    case "commented":
      return `${name} commented on your prayer: “${a.text}”`;
    case "reacted": {
      const r = reactionInfo(a.reaction!);
      return `${name} reacted ${r.emoji} ${r.label} to your prayer`;
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
      ListEmptyComponent={<Muted>Nothing from friends in the last week yet. When they pray, comment or react, it shows up here.</Muted>}
      renderItem={({ item }) => {
        const who = names.get(item.actorId);
        return (
          <Pressable onPress={() => router.push(`/post/${item.postId}`)} style={styles.row} accessibilityRole="link">
            <Avatar path={who?.avatarPath ?? null} name={who?.displayName ?? ""} size={40} />
            <View style={styles.body}>
              <Text style={styles.text} numberOfLines={3}>{describe(item, who?.displayName ?? "A friend")}</Text>
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
  text: { fontSize: 17, lineHeight: 23, color: colors.text },
  time: { fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted },
}));
