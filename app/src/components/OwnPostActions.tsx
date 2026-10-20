import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { db } from "../firebase";
import { deletePost, setAnswered, type Post } from "../lib/posts";
import { Button, makeStyles } from "./ui";
import { t } from "../i18n";

export function OwnPostActions({ post }: { post: Post }) {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const confirmDelete = () =>
    Alert.alert(t("own.deleteTitle"), t("own.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deletePost(db, post);
          } catch (err) {
            console.warn(err);
            Alert.alert(t("post.couldntDelete"), t("common.tryAgain"));
            setBusy(false);
          }
        },
      },
    ]);
  // One tap to mark it answered (a note on how can be added with Edit).
  async function markAnswered() {
    setBusy(true);
    try {
      await setAnswered(db, post, true);
    } catch (err) {
      console.warn(err);
      Alert.alert(t("common.didntWork"), t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.actions}>
      {!post.answeredAt && (
        <Button title={t("own.markAnswered")} kind="secondary" disabled={busy} onPress={markAnswered} />
      )}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title={t("common.edit")} kind="secondary" disabled={busy} onPress={() => router.push({ pathname: "/compose", params: { postId: post.id } })} />
        </View>
        <View style={styles.flex}>
          <Button title={t("common.delete")} kind="danger" busy={busy} onPress={confirmDelete} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  actions: { gap: 8, marginTop: 4 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
}));
