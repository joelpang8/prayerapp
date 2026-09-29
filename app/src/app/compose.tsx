import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, colors, ErrorText, Muted } from "../components/ui";
import { db, storage } from "../firebase";
import { pickPhotoForDevelopment, takePhoto, type CapturedPhoto } from "../lib/capture";
import { createPost, editPost, MAX_NOTES, notesProblem } from "../lib/posts";
import { useLatestPrompt, useMyPosts, usePhoto } from "../session/hooks";
import { useReadySession } from "../session/SessionProvider";

export default function ComposeScreen() {
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const { profile } = useReadySession();
  const { prompt } = useLatestPrompt();
  const { posts, loaded } = useMyPosts();
  const editing = postId ? posts.find((p) => p.id === postId) : undefined;

  if (postId && !loaded) return null;
  if (postId && !editing) {
    return (
      <View style={styles.root}>
        <Muted>That post no longer exists.</Muted>
      </View>
    );
  }
  return <Composer key={editing?.id ?? "new"} uid={profile.uid} prompt={prompt} editing={editing} />;
}

function Composer({
  uid,
  prompt,
  editing,
}: {
  uid: string;
  prompt: ReturnType<typeof useLatestPrompt>["prompt"];
  editing: ReturnType<typeof useMyPosts>["posts"][number] | undefined;
}) {
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingUri = usePhoto(editing?.photoPath ?? null, uid);

  async function capture(fn: () => Promise<CapturedPhoto | null>) {
    setError(null);
    try {
      const p = await fn();
      if (p) setPhoto(p);
    } catch (err) {
      console.warn(err);
      setError("Couldn't use that photo.");
    }
  }

  async function submit() {
    const problem = notesProblem(notes);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await editPost(db, storage, editing, { notes, newPhoto: photo ?? undefined });
      } else {
        if (!prompt) throw new Error("no prompt");
        if (!photo) return setError("Take a photo first.");
        await createPost(db, storage, { uid, prompt, notes, jpeg: photo.jpeg, photoId: photo.photoId });
      }
      router.back();
    } catch (err) {
      console.warn(err);
      setError("Couldn't save your post. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const previewUri = photo?.previewUri ?? (editing ? existingUri : null);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{editing ? "Edit post" : "Pray now"}</Text>
        <View style={styles.photo}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
          ) : (
            <Muted>No photo yet</Muted>
          )}
        </View>
        <Button title={previewUri ? "Retake photo" : "Take photo"} kind="secondary" onPress={() => capture(takePhoto)} disabled={busy} />
        {__DEV__ && (
          <Button title="Choose photo (development)" kind="secondary" onPress={() => capture(pickPhotoForDevelopment)} disabled={busy} />
        )}
        <Text style={styles.label}>What did you pray for?</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={MAX_NOTES}
          style={styles.input}
          placeholder="A few words for your friends"
          textAlignVertical="top"
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button title={editing ? "Save changes" : "Post"} onPress={submit} busy={busy} disabled={!notes.trim() || (!editing && !photo)} />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  photo: { aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  label: { fontWeight: "600", color: colors.text, marginTop: 8 },
  input: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: colors.card },
});
