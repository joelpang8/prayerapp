import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db, storage } from "../firebase";
import { photoBlob, pickAvatar } from "../lib/capture";
import { BIO_MAX, removeAvatar, saveBio, setAvatar, watchBio } from "../lib/profile";
import { useReadySession } from "../session/SessionProvider";

/** Profile photo (camera or library) and the friends-only bio. Opened from the Profile tab. */
export default function EditProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
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
      <Button title="Done" kind="secondary" onPress={() => router.back()} disabled={photoBusy || bioBusy} />
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
}));
