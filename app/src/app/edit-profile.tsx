import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db, storage } from "../firebase";
import { photoBlob, pickAvatar } from "../lib/capture";
import { BirthdayField } from "../components/BirthdayField";
import { SelectField } from "../components/SelectField";
import { BIBLE_VERSIONS, DENOMINATIONS } from "../lib/faith";
import { ABOUT_LIMITS, aboutProblem, removeAvatar, saveAbout, setAvatar, watchAbout, type About } from "../lib/profile";
import { useReadySession } from "../session/SessionProvider";

/** Profile photo (camera or library) and the friends-only details. Opened from the Profile tab. */
export default function EditProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState<About | null>(null);
  // The form, filled from the stored details once they've loaded.
  const [form, setForm] = useState<About | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const filled = useRef(false);

  useEffect(
    () => watchAbout(db, profile.uid, (about) => {
      setSaved(about);
      // Fill the form once; later updates (e.g. my own save) don't overwrite typing.
      if (!filled.current) {
        filled.current = true;
        setForm(about);
      }
    }, () => setError("Couldn't load your profile.")),
    [profile.uid],
  );

  async function changePhoto(source: "camera" | "library") {
    setError(null);
    try {
      const photo = await pickAvatar(source);
      if (!photo) return;
      setPreview(photo.previewUri);
      setPhotoBusy(true);
      await setAvatar(db, storage, profile.uid, await photoBlob(photo.previewUri), photo.photoId);
    } catch (err) {
      console.warn("profile photo upload failed", err);
      setError("Couldn't update your photo. Please try again.");
    } finally {
      setPreview(null);
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    setError(null);
    setPhotoBusy(true);
    try {
      await removeAvatar(db, profile.uid);
    } catch {
      setError("Couldn't remove your photo. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const next = form;
  const problem = next ? aboutProblem(next) : null;
  const changed = !!next && !!saved && (Object.keys(next) as (keyof About)[]).some((k) => next[k].trim() !== saved[k]);

  async function submit() {
    if (!next) return;
    setError(null);
    setBusy(true);
    try {
      await saveAbout(db, profile.uid, next);
      setSavedNote(true);
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof About) => (text: string) => {
    setSavedNote(false);
    setForm((f) => (f ? { ...f, [key]: text } : f));
  };
  const field = (key: keyof typeof ABOUT_LIMITS, label: string, placeholder: string, multiline = false) => {
    const value = form?.[key] ?? "";
    const remaining = ABOUT_LIMITS[key] - value.trim().length;
    return (
      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <Text style={styles.label}>{label}</Text>
          {remaining < 40 && <Text style={[styles.counter, remaining < 0 && { color: colors.danger }]}>{remaining}</Text>}
        </View>
        <TextInput
          value={value}
          onChangeText={set(key)}
          placeholder={placeholder}
          multiline={multiline}
          maxLength={ABOUT_LIMITS[key] + 20}
          style={[styles.input, multiline && styles.multiline]}
          editable={!!form}
        />
      </View>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Edit profile</Text>
      <View style={styles.card}>
        <View style={styles.identity}>
          <Avatar path={profile.avatarPath} name={profile.displayName} size={72} previewUri={preview} />
          <View style={styles.names}>
            <Text style={styles.name}>{profile.displayName}</Text>
            <Muted>@{profile.username}</Muted>
          </View>
        </View>
        <View style={styles.photoActions}>
          <Button title="Take photo" kind="secondary" onPress={() => changePhoto("camera")} disabled={photoBusy} />
          <Button title="Choose photo" kind="secondary" onPress={() => changePhoto("library")} busy={photoBusy} />
          {profile.avatarPath && <Button title="Remove" kind="danger" onPress={deletePhoto} disabled={photoBusy} />}
        </View>
        <Muted>Anyone signed in can see your photo, name and username.</Muted>
      </View>

      <View style={styles.card}>
        <Muted>Only your friends can see these. Fill in as much or as little as you like.</Muted>
        {field("bio", "Bio", "A line or two about yourself", true)}

        <View style={styles.field}>
          <Text style={styles.label}>Birthday</Text>
          <BirthdayField value={form?.birthday ?? ""} onChange={set("birthday")} />
        </View>
        {field("hometown", "Where I'm from", "e.g. Lagos, Nigeria")}

        {field("prayerRequests", "Prayer requests", "What would you like your friends to pray for?", true)}
        <View style={styles.field}>
          <Text style={styles.label}>Bible version I read</Text>
          <SelectField
            title="Bible version"
            value={form?.bibleVersion ?? ""}
            onChange={set("bibleVersion")}
            options={BIBLE_VERSIONS.map((v) => ({ value: v.abbr, label: `${v.name} (${v.abbr})` }))}
            placeholder="Choose a version"
            otherMaxLength={ABOUT_LIMITS.bibleVersion}
            otherPlaceholder="Your Bible version"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Denomination</Text>
          <SelectField
            title="Denomination"
            value={form?.denomination ?? ""}
            onChange={set("denomination")}
            options={DENOMINATIONS.map((d) => ({ value: d, label: d }))}
            placeholder="Choose a denomination"
            otherMaxLength={ABOUT_LIMITS.denomination}
            otherPlaceholder="Your denomination"
          />
        </View>
        {field("church", "My church", "Church name and city")}

        {problem && <ErrorText>{problem}</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}
        <Button title={savedNote && !changed ? "Saved" : "Save"} onPress={submit} busy={busy} disabled={!changed || !!problem} />
      </View>
      <Button title="Done" kind="secondary" onPress={() => router.back()} disabled={photoBusy || busy} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 32, fontFamily: fonts.displayBold, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { gap: 6, marginTop: 8 },
  fieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text },
  counter: { fontSize: 14, color: colors.muted },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: colors.text,
  },
  multiline: { minHeight: 80, lineHeight: 24, textAlignVertical: "top" },
}));
