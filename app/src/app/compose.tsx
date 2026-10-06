import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db, storage } from "../firebase";
import { photoBlob, pickPhotoForDevelopment, takePhoto, type CapturedPhoto } from "../lib/capture";
import { currentPlaceName, LocationUnavailableError } from "../lib/location";
import { createPost, editPost, MAX_ANSWER_NOTE, MAX_NOTES, notesProblem, setAnswered } from "../lib/posts";
import { useLatestPrompt, useMyPosts, usePhoto } from "../session/hooks";
import { useReadySession } from "../session/SessionProvider";

export default function ComposeScreen() {
  const styles = useStyles();
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
  const styles = useStyles();
  const colors = useColors();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingUri = usePhoto(editing?.photoPath ?? null, uid);
  // Location is opt-in for each post and off by default. Only a place name
  // is kept; it can be removed when editing, but not added or changed.
  const [showPlace, setShowPlace] = useState(!!editing?.place);
  const [place, setPlace] = useState<string | null>(editing?.place ?? null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  // Editing only: "this prayer was answered" and how.
  const [answered, setAnsweredBox] = useState(!!editing?.answeredAt);
  const [answerNote, setAnswerNote] = useState(editing?.answerNote ?? "");

  async function togglePlace(on: boolean) {
    setShowPlace(on);
    setPlaceNote(null);
    if (!on || editing || place) return;
    setPlaceBusy(true);
    try {
      setPlace(await currentPlaceName());
    } catch (err) {
      setShowPlace(false);
      setPlaceNote(
        err instanceof LocationUnavailableError && err.reason === "permission"
          ? "Location access is off for this app. You can turn it on in your phone's Settings."
          : "Couldn't find where you are right now.",
      );
    } finally {
      setPlaceBusy(false);
    }
  }

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
        // The prayer itself (marks it "edited") and its answer are saved
        // separately, so answering alone doesn't add the Edited label.
        const removePlace = !!editing.place && !showPlace;
        if (notes.trim() !== editing.notes || photo || removePlace) {
          const newPhoto = photo ? { jpeg: await photoBlob(photo.previewUri), photoId: photo.photoId } : undefined;
          await editPost(db, storage, editing, { notes, newPhoto, removePlace });
        }
        const answerChanged =
          answered !== !!editing.answeredAt || (answered && answerNote.trim() !== (editing.answerNote ?? ""));
        if (answerChanged) await setAnswered(db, editing, answered, answerNote);
      } else {
        if (!prompt) throw new Error("no prompt");
        if (!photo) return setError("Take a photo first.");
        const jpeg = await photoBlob(photo.previewUri);
        await createPost(db, storage, { uid, prompt, notes, jpeg, photoId: photo.photoId, place: showPlace ? place : null });
      }
      router.back();
    } catch (err) {
      console.warn("post failed", err);
      setError(
        "Couldn't save your post. Check your connection and try again." +
          // Development builds show the real error, to make problems easy to report.
          (__DEV__ ? `\n\n[dev] ${(err as { code?: string }).code ?? ""} ${(err as Error).message ?? err}` : ""),
      );
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
        {(!editing || editing.place) && (
          <View style={styles.placeRow}>
            <View style={styles.placeText}>
              <Text style={styles.label}>{editing ? "Show location" : "Show where I prayed"}</Text>
              <Muted>
                {placeBusy
                  ? "Finding your town…"
                  : showPlace && place
                    ? `📍 ${place}`
                    : "Only your town or city is shared, never your exact location."}
              </Muted>
            </View>
            <Switch
              value={showPlace}
              onValueChange={togglePlace}
              disabled={busy || placeBusy}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="Show where I prayed"
            />
          </View>
        )}
        {placeNote && <Muted>{placeNote}</Muted>}
        {editing && (
          <View style={styles.answerBox}>
            <Pressable
              onPress={() => setAnsweredBox(!answered)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: answered }}
              style={styles.checkRow}
              disabled={busy}
            >
              <Ionicons name={answered ? "checkbox" : "square-outline"} size={28} color={colors.accent} />
              <Text style={styles.checkLabel}>This prayer was answered</Text>
            </Pressable>
            {answered && (
              <TextInput
                value={answerNote}
                onChangeText={setAnswerNote}
                multiline
                maxLength={MAX_ANSWER_NOTE}
                style={styles.input}
                placeholder="How was it answered? (optional)"
                textAlignVertical="top"
              />
            )}
            <Muted>Your friends will see it marked Answered{answered && answerNote.trim() ? ", with your note" : ""}.</Muted>
          </View>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button title={editing ? "Save changes" : "Post"} onPress={submit} busy={busy} disabled={!notes.trim() || (!editing && !photo) || placeBusy} />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 32, fontFamily: fonts.displayBold, color: colors.text },
  photo: { aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text, marginTop: 8 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  answerBox: { gap: 8, marginTop: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  checkLabel: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text },
  placeText: { flex: 1, gap: 2 },
  // Prayer notes are written in the same serif they're read in.
  input: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 18, lineHeight: 25, fontFamily: fonts.serif, backgroundColor: colors.card },
}));
