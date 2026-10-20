import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { db } from "../firebase";
import { deletePost, type Post } from "../lib/posts";
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
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Button title={t("common.edit")} kind="secondary" disabled={busy} onPress={() => router.push({ pathname: "/compose", params: { postId: post.id } })} />
      </View>
      <View style={styles.flex}>
        <Button title={t("common.delete")} kind="danger" busy={busy} onPress={confirmDelete} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  flex: { flex: 1 },
}));
