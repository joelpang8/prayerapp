import { Image } from "expo-image";
import { ActivityIndicator, Alert, View } from "react-native";
import type { QueuedPost } from "../lib/outbox";
import { useOutbox } from "../session/hooks";
import { Button, fonts, makeStyles, Muted, Text, useColors } from "./ui";
import { t } from "../i18n";

/** My post that hasn't reached the server yet: waiting, or refused with Retry/Discard. */
export function QueuedPostCard({ item }: { item: QueuedPost }) {
  const styles = useStyles();
  const colors = useColors();
  const { retry, discard } = useOutbox();
  const failed = item.status === "failed";
  const confirmDiscard = () =>
    Alert.alert(t("queued.discardTitle"), t("queued.discardBody"), [
      { text: t("queued.keep"), style: "cancel" },
      { text: t("queued.discard"), style: "destructive", onPress: () => discard(item.postId) },
    ]);
  return (
    <View style={styles.card}>
      <View style={styles.status}>
        {!failed && <ActivityIndicator color={colors.accent} />}
        <Text style={styles.title}>{failed ? t("queued.couldntPost") : t("queued.waiting")}</Text>
      </View>
      <Muted>
        {failed
          ? item.problem ?? t("queued.wentWrong")
          : t("queued.offline")}
      </Muted>
      <View style={styles.row}>
        {/* My own photo, from this phone; never written to the image cache. */}
        <Image source={{ uri: item.photoUri }} style={styles.thumb} contentFit="cover" cachePolicy="none" />
        <Text style={styles.notes} numberOfLines={3}>{item.notes}</Text>
      </View>
      {failed ? (
        <View style={styles.actions}>
          <View style={styles.flex}><Button title={t("common.retry")} onPress={() => retry(item.postId)} /></View>
          <View style={styles.flex}><Button title={t("queued.discard")} kind="danger" onPress={confirmDiscard} /></View>
        </View>
      ) : (
        <Button title={t("queued.discard")} kind="secondary" onPress={confirmDiscard} />
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
