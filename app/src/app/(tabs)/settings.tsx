import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Avatar } from "../../components/Avatar";
import { Button, colors, ErrorText, fonts, Muted, SectionTitle, Text, TextInput } from "../../components/ui";
import { db, storage } from "../../firebase";
import { photoBlob, pickAvatar } from "../../lib/capture";
import { BIO_MAX, removeAvatar, saveBio, setAvatar, watchBio } from "../../lib/profile";
import { TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { useSettings } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  const { profile } = useReadySession();
  const settings = useSettings();
  const [error, setError] = useState<string | null>(null);

  async function choose(id: TranslationId) {
    setError(null);
    try {
      await setBibleVersion(db, profile.uid, id);
    } catch {
      setError("Couldn't save. Please try again.");
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ProfileEditor />

      <SectionTitle>Bible translation</SectionTitle>
      <View style={styles.card}>
        {TRANSLATIONS.map((t) => {
          const selected = settings.bibleVersion === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(t.id)}
              style={styles.option}
            >
              <Text style={styles.optionText}>{t.name} ({t.id})</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
        <Muted>Verses with each day&apos;s prompt are shown in this translation. More translations will come later.</Muted>
      </View>
      {error && <ErrorText>{error}</ErrorText>}

      <View style={styles.spacer} />
      <Button title="Sign out" kind="secondary" onPress={() => signOut()} />
    </ScrollView>
  );
}

function ProfileEditor() {
  const { profile } = useReadySession();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null); // bio as stored
  // null until edited; the box shows the stored bio until then.
  const [draft, setDraft] = useState<string | null>(null);
  const bio = draft ?? saved ?? "";
  const [bioBusy, setBioBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => watchBio(db, profile.uid, setSaved, () => setError("Couldn't load your bio.")),
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

  async function submitBio() {
    setError(null);
    setBioBusy(true);
    try {
      await saveBio(db, profile.uid, bio);
      setDraft(null);
    } catch {
      setError("Couldn't save your bio. Please try again.");
    } finally {
      setBioBusy(false);
    }
  }

  const remaining = BIO_MAX - bio.trim().length;
  const bioChanged = saved !== null && bio.trim() !== saved;

  return (
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

      <Text style={styles.label}>Bio</Text>
      <TextInput
        value={bio}
        onChangeText={setDraft}
        placeholder="A line or two about yourself"
        multiline
        maxLength={BIO_MAX + 20}
        style={styles.bioInput}
        editable={saved !== null}
      />
      <View style={styles.bioFooter}>
        <Text style={[styles.counter, remaining < 0 && { color: colors.danger }]}>{remaining}</Text>
        <Button title="Save bio" onPress={submitBio} busy={bioBusy} disabled={!bioChanged || remaining < 0} />
      </View>
      <Muted>Only your friends can see your bio.</Muted>
      {error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  names: { flex: 1, gap: 2 },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.text, marginTop: 8 },
  bioInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: fonts.serif,
    color: colors.text,
    textAlignVertical: "top",
  },
  bioFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { fontSize: 14, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  name: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  optionText: { fontSize: 17, color: colors.text },
  check: { fontSize: 18, color: colors.accent, fontFamily: fonts.serifSemiBold },
  spacer: { height: 16 },
});
