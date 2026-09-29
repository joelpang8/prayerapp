import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { db } from "../firebase";
import { deletePost, type Post } from "../lib/posts";
import { Button } from "./ui";

export function OwnPostActions({ post }: { post: Post }) {
  const [busy, setBusy] = useState(false);
  const confirmDelete = () =>
    Alert.alert("Delete this post?", "Your friends will no longer see it. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deletePost(db, post);
          } catch (err) {
            console.warn(err);
            Alert.alert("Couldn't delete", "Please try again.");
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Button title="Edit" kind="secondary" disabled={busy} onPress={() => router.push({ pathname: "/compose", params: { postId: post.id } })} />
      </View>
      <View style={styles.flex}>
        <Button title="Delete" kind="danger" busy={busy} onPress={confirmDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  flex: { flex: 1 },
});
