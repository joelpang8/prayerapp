import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { CountdownPill } from "../components/PromptCountdown";
import { PrayerHelper } from "../components/PrayerHelper";
import { VerseBlock } from "../components/VerseBlock";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db } from "../firebase";
import { pickPhotoForDevelopment, takePhoto, type CapturedPhoto } from "../lib/capture";
import { clearDraft, loadDraft, saveDraft } from "../lib/draft";
import { currentPlaceName, LocationUnavailableError } from "../lib/location";
import { editPost, MAX_ANSWER_NOTE, MAX_NOTES, notesProblem, postIdFor, setAnswered } from "../lib/posts";
import { useLatestPrompt, useMyPosts, useNow, usePhoto } from "../session/hooks";
import { beginPraying, cancelPraying, stampMs, START_GRACE_MS, startStillValid, type StartStamp } from "../lib/prayStart";
import { useReadySession } from "../session/SessionProvider";
import { locale, t } from "../i18n";
import { haptics } from "../lib/haptics";
import { OfflineBanner } from "../components/OfflineBanner";

/** The notes counter appears once this many characters or fewer are left. */
const NOTES_COUNTER_FROM = 200;

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
        <Muted>{t("compose.gone")}</Muted>
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
  const { outbox } = useReadySession();
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
  // New posts only: keep this prayer private (a journal entry), never in the feed.
  const [isPrivate, setIsPrivate] = useState(false);
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
          ? t("compose.locationOff")
          : t("compose.locationFailed"),
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
      setError(t("compose.photoFailed"));
    }
  }

  // A new prayer's words are kept on the phone while writing (lib/draft.ts),
  // so closing the app doesn't lose them. Restored when coming back.
  const draftPromptId = editing ? null : prompt?.id ?? null;
  useEffect(() => {
    if (!draftPromptId) return;
    let live = true;
    loadDraft(uid, draftPromptId).then((saved) => {
      if (live && saved) setNotes((current) => (current.trim() ? current : saved));
    });
    return () => { live = false; };
  }, [uid, draftPromptId]);
  useEffect(() => {
    if (!draftPromptId) return;
    const timer = setTimeout(() => { void saveDraft(uid, draftPromptId, notes); }, 400);
    return () => clearTimeout(timer);
  }, [uid, draftPromptId, notes]);

  // Leaving with unsaved words or a photo (Cancel, or swiping the screen
  // down) asks first. After posting or saving, it just closes.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { if (leaving) router.back(); }, [leaving]);

  // "Pray now" keeps you on time (lib/prayStart.ts): opening this screen in
  // time records the start, giving 15 minutes to pray and post. Leaving
  // without posting gives it up.
  const startPromptId = editing ? null : prompt?.id ?? null;
  const [start, setStart] = useState<StartStamp | null>(null);
  const posted = useRef(false);
  useEffect(() => {
    if (!startPromptId) return;
    let live = true;
    beginPraying(db, uid, startPromptId).then((s) => { if (live) setStart(s); });
    return () => {
      live = false;
      if (!posted.current) void cancelPraying(db, uid, startPromptId);
    };
  }, [uid, startPromptId]);
  const now = useNow();
  const startValid = !!start && startStillValid(start, now);
  const unsaved = editing
    ? notes.trim() !== editing.notes
      || answered !== !!editing.answeredAt
      || (answered && answerNote.trim() !== (editing.answerNote ?? ""))
      || (!!editing.place && !showPlace)
    : !!notes.trim() || !!photo;
  const navigation = useNavigation();
  usePreventRemove(unsaved && !leaving && !busy, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (editing) {
      Alert.alert(t("compose.discardEditTitle"), undefined, [
        { text: t("compose.keepEditing"), style: "cancel" },
        { text: t("compose.discardChanges"), style: "destructive", onPress: leave },
      ]);
      return;
    }
    Alert.alert(t("compose.discardTitle"), t(notes.trim() ? "compose.discardBodyDraft" : "compose.discardBody"), [
      { text: t("compose.keepWriting"), style: "cancel" },
      ...(notes.trim() ? [{ text: t("compose.saveDraft"), onPress: leave }] : []),
      { text: t("compose.discard"), style: "destructive" as const, onPress: () => { void clearDraft(uid); leave(); } },
    ]);
  });

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
        if (notes.trim() !== editing.notes || removePlace) {
          await editPost(db, editing, { notes, removePlace });
        }
        const answerChanged =
          answered !== !!editing.answeredAt || (answered && answerNote.trim() !== (editing.answerNote ?? ""));
        if (answerChanged) await setAnswered(db, editing, answered, answerNote);
      } else {
        if (!prompt) throw new Error("no prompt");
        if (!photo) return setError(t("compose.photoFirst"));
        // Through the outbox: it sends now if it can, and otherwise keeps the
        // post on the phone and sends it when the connection is back.
        await outbox.enqueue({
          postId: postIdFor(prompt.id, uid),
          uid,
          prompt: { id: prompt.id, firedAt: prompt.firedAt.getTime(), verseRef: prompt.verseRef },
          notes: notes.trim(),
          photoUri: photo.previewUri,
          photoId: photo.photoId,
          place: showPlace ? place : null,
          visibility: isPrivate ? "private" : "friends",
          takenAt: photo.takenAt,
          startedAt: start && startStillValid(start, Date.now()) ? start : null,
        });
      }
      if (!editing) {
        posted.current = true;
        void clearDraft(uid);
      }
      // A new prayer gets its "amen" when it actually sends (SessionProvider);
      // an edit gets the usual tap now.
      if (editing) haptics.done();
      setLeaving(true);
    } catch (err) {
      console.warn("post failed", err);
      setError(
        t("compose.saveFailed") +
          // Development builds show the real error, to make problems easy to report.
          (__DEV__ ? `\n\n[dev] ${(err as { code?: string }).code ?? ""} ${(err as Error).message ?? err}` : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  const previewUri = editing ? existingUri : photo?.previewUri ?? null;
  // The day's verse, to pray with while writing: the post's own when editing.
  const verseRef = editing ? editing.verseRef : prompt?.verseRef;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{editing ? t("compose.editTitle") : t("today.prayNow")}</Text>
        {!editing && <OfflineBanner message={t("offline.compose")} />}
        {!editing && prompt && (startValid ? (
          <View style={styles.onTime} accessibilityLiveRegion="polite">
            <Text style={styles.onTimeText}>
              {t("compose.onTimeUntil", { time: new Date(stampMs(start!) + START_GRACE_MS).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) })}
            </Text>
          </View>
        ) : <CountdownPill firedAt={prompt.firedAt} />)}
        {verseRef && (
          <View style={styles.verse}>
            <Text style={styles.verseLabel} accessibilityRole="header">{editing ? t("compose.thatDaysVerse") : t("compose.todaysVerse")}</Text>
            <VerseBlock refId={verseRef} readMore={false} />
          </View>
        )}
        <View style={styles.photo}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
          ) : (
            <Muted>{t("compose.noPhoto")}</Muted>
          )}
        </View>
        {/* Not when editing: the photo can't be changed after posting. */}
        {!editing && (
          <Button title={previewUri ? t("compose.retakePhoto") : t("compose.takePhoto")} kind="secondary" onPress={() => capture(takePhoto)} disabled={busy} />
        )}
        {__DEV__ && !editing && (
          <Button title="Choose photo (development)" kind="secondary" onPress={() => capture(pickPhotoForDevelopment)} disabled={busy} />
        )}
        <Text style={styles.label}>{t("compose.whatFor")}</Text>
        <PrayerHelper notes={notes} />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={MAX_NOTES}
          style={styles.input}
          placeholder={t("compose.notesPlaceholder")}
          textAlignVertical="top"
        />
        {/* Shown only near the limit, like Edit profile. */}
        {MAX_NOTES - notes.length <= NOTES_COUNTER_FROM && (
          <Text style={styles.counter} accessibilityLiveRegion="polite">
            {t("compose.charsLeft", { count: MAX_NOTES - notes.length })}
          </Text>
        )}
        {(!editing || editing.place) && (
          <View style={styles.placeRow}>
            <View style={styles.placeText}>
              <Text style={styles.label}>{editing ? t("compose.showLocation") : t("compose.showWhere")}</Text>
              <Muted>
                {placeBusy
                  ? t("compose.findingTown")
                  : showPlace && place
                    ? `📍 ${place}`
                    : t("compose.townOnly")}
              </Muted>
            </View>
            <Switch
              value={showPlace}
              onValueChange={togglePlace}
              disabled={busy || placeBusy}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("compose.showWhere")}
            />
          </View>
        )}
        {placeNote && <Muted>{placeNote}</Muted>}
        {!editing && (
          <View style={styles.placeRow}>
            <View style={styles.placeText}>
              <Text style={styles.label}>{t("compose.private")}</Text>
              <Muted>
                {isPrivate
                  ? t("compose.privateOn")
                  : t("compose.privateOff")}
              </Muted>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              disabled={busy}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("compose.keepPrivate")}
            />
          </View>
        )}
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
              <Text style={styles.checkLabel}>{t("compose.wasAnswered")}</Text>
            </Pressable>
            {answered && (
              <TextInput
                value={answerNote}
                onChangeText={setAnswerNote}
                multiline
                maxLength={MAX_ANSWER_NOTE}
                style={styles.input}
                placeholder={t("compose.howAnswered")}
                textAlignVertical="top"
              />
            )}
            <Muted>{answered && answerNote.trim() ? t("compose.answeredSeenWithNote") : t("compose.answeredSeen")}</Muted>
          </View>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button title={editing ? t("compose.saveChanges") : t("compose.post")} onPress={submit} busy={busy} disabled={!notes.trim() || (!editing && !photo) || placeBusy} />
        <Button title={t("common.cancel")} kind="secondary" onPress={() => router.back()} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.text },
  photo: { aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  verse: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  verseLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.accent, textTransform: "uppercase", letterSpacing: 0.8 },
  counter: { fontSize: 14, color: colors.muted, alignSelf: "flex-end", marginTop: -6 },
  onTime: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  onTimeText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  label: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 8 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  answerBox: { gap: 8, marginTop: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  checkLabel: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.text },
  placeText: { flex: 1, gap: 2 },
  // Prayer notes are written in the same font they're read in.
  input: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 17, lineHeight: 25, fontFamily: fonts.body, backgroundColor: colors.card },
}));
