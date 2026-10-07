import { Image } from "expo-image";
import { ActivityIndicator, Alert, View } from "react-native";
import type { QueuedPost } from "../lib/outbox";
import { useOutbox } from "../session/hooks";
import { Button, fonts, makeStyles, Muted, Text, useColors } from "./ui";

/** My post that hasn't reached the server yet: waiting, or refused with Retry/Discard. */
export function QueuedPostCard({ item }: { item: QueuedPost }) {
  const styles = useStyles();
  const colors = useColors();
  const { retry, discard } = useOutbox();
  const failed = item.status === "failed";
  const confirmDiscard = () =>
    Alert.alert("Discard this prayer?", "It hasn't been posted, so it will be gone.", [
      { text: "Keep", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => discard(item.postId) },
    ]);
  return (
    <View style={styles.card}>
      <View style={styles.status}>
        {!failed && <ActivityIndicator color={colors.accent} />}
        <Text style={styles.title}>{failed ? "Couldn't post" : "Waiting to send"}</Text>
      </View>
      <Muted>
        {failed
          ? item.problem ?? "Something went wrong."
          : "No connection right now. Your prayer is saved on this phone and will post by itself as soon as you're back online."}
      </Muted>
      <View style={styles.row}>
        {/* My own photo, from this phone; never written to the image cache. */}
        <Image source={{ uri: item.photoUri }} style={styles.thumb} contentFit="cover" cachePolicy="none" />
        <Text style={styles.notes} numberOfLines={3}>{item.notes}</Text>
      </View>
      {failed ? (
        <View style={styles.actions}>
          <View style={styles.flex}><Button title="Try again" onPress={() => retry(item.postId)} /></View>
          <View style={styles.flex}><Button title="Discard" kind="danger" onPress={confirmDiscard} /></View>
        </View>
      ) : (
        <Button title="Discard" kind="secondary" onPress={confirmDiscard} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, padding: 16, gap: 10 },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 64, height: 85, borderRadius: 8, overflow: "hidden" },
  notes: { flex: 1, fontSize: 17, lineHeight: 24, fontFamily: fonts.serif, color: colors.text },
  actions: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
}));
