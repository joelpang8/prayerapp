import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db, storage } from "../firebase";
import { photoBlob, pickAvatar } from "../lib/capture";
import { BirthdayField } from "../components/BirthdayField";
import { RequestListEditor } from "../components/RequestListEditor";
import { SelectField } from "../components/SelectField";
import { joinRequests, MAX_REQUESTS, splitRequests } from "../lib/prayerRequests";
import { BIBLE_VERSIONS, DENOMINATIONS, denominationLabel } from "../lib/faith";
import { ABOUT_LIMITS, aboutFields, aboutProblem, removeAvatar, saveAbout, setAvatar, watchAbout, type About, type AboutDoc } from "../lib/profile";
import { useReadySession } from "../session/SessionProvider";
import { t } from "../i18n";

/** Profile photo (camera or library) and the friends-only details. Opened from the Profile tab. */
export default function EditProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState<AboutDoc | null>(null);
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
        setForm(aboutFields(about));
      }
    }, () => setError(t("editProfile.couldntLoad"))),
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
      setError(t("editProfile.couldntUpdatePhoto"));
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
      setError(t("editProfile.couldntRemovePhoto"));
    } finally {
      setPhotoBusy(false);
    }
  }

  const next = form;
  const problem = next ? aboutProblem(next) : null;
  // Requests compare as saved: blank rows in the editor don't count as a change.
  const asSaved = (k: keyof About, v: string) => (k === "prayerRequests" ? joinRequests(splitRequests(v)) : v.trim());
  const changed = !!next && !!saved && (Object.keys(next) as (keyof About)[]).some((k) => asSaved(k, next[k]) !== saved[k]);

  async function submit() {
    if (!next) return;
    setError(null);
    setBusy(true);
    try {
      await saveAbout(db, profile.uid, next, saved);
      setSavedNote(true);
    } catch {
      setError(t("editProfile.couldntSave"));
    } finally {
      setBusy(false);
    }
  }

  const requestsLeft = ABOUT_LIMITS.prayerRequests - joinRequests(splitRequests(form?.prayerRequests ?? "")).length;
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
      <Text style={styles.title}>{t("editProfile.title")}</Text>
      <View style={styles.card}>
        <View style={styles.identity}>
          <Avatar path={profile.avatarPath} name={profile.displayName} size={72} previewUri={preview} />
          <View style={styles.names}>
            <Text style={styles.name}>{profile.displayName}</Text>
            <Muted>@{profile.username}</Muted>
          </View>
        </View>
        <View style={styles.photoActions}>
          <Button title={t("editProfile.takePhoto")} kind="secondary" onPress={() => changePhoto("camera")} disabled={photoBusy} />
          <Button title={t("editProfile.choosePhoto")} kind="secondary" onPress={() => changePhoto("library")} busy={photoBusy} />
          {profile.avatarPath && <Button title={t("editProfile.remove")} kind="danger" onPress={deletePhoto} disabled={photoBusy} />}
        </View>
        <Muted>{t("editProfile.publicNote")}</Muted>
      </View>

      <View style={styles.card}>
        <Muted>{t("editProfile.friendsOnlyNote")}</Muted>
        {field("bio", t("editProfile.bio"), t("editProfile.bioPlaceholder"), true)}

        <View style={styles.field}>
          <Text style={styles.label}>{t("editProfile.birthday")}</Text>
          <BirthdayField value={form?.birthday ?? ""} onChange={set("birthday")} />
        </View>
        {field("hometown", t("editProfile.hometown"), t("editProfile.hometownPlaceholder"))}

        <View style={styles.field}>
          <View style={styles.fieldHeader}>
            <Text style={styles.label} accessibilityRole="header">{t("editProfile.prayerRequests")}</Text>
            {requestsLeft < 40 && <Text style={[styles.counter, requestsLeft < 0 && { color: colors.danger }]}>{requestsLeft}</Text>}
          </View>
          <Muted>{t("editProfile.requestsPrompt")}</Muted>
          {form && <RequestListEditor initial={form.prayerRequests} onChange={set("prayerRequests")} />}
        </View>
        <Muted>{t("editProfile.requestsNote", { max: MAX_REQUESTS })}</Muted>
        <View style={styles.field}>
          <Text style={styles.label}>{t("editProfile.bibleVersionRead")}</Text>
          <SelectField
            title={t("editProfile.bibleVersion")}
            value={form?.bibleVersion ?? ""}
            onChange={set("bibleVersion")}
            options={BIBLE_VERSIONS.map((v) => ({ value: v.abbr, label: `${v.name} (${v.abbr})` }))}
            placeholder={t("editProfile.chooseVersion")}
            otherMaxLength={ABOUT_LIMITS.bibleVersion}
            otherPlaceholder={t("editProfile.yourVersion")}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{t("editProfile.denomination")}</Text>
          <SelectField
            title={t("editProfile.denomination")}
            value={form?.denomination ?? ""}
            onChange={set("denomination")}
            options={DENOMINATIONS.map((d) => ({ value: d, label: denominationLabel(d) }))}
            placeholder={t("editProfile.chooseDenomination")}
            otherMaxLength={ABOUT_LIMITS.denomination}
            otherPlaceholder={t("editProfile.yourDenomination")}
          />
        </View>
        {field("church", t("editProfile.church"), t("editProfile.churchPlaceholder"))}

        {problem && <ErrorText>{problem}</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}
        <Button title={savedNote && !changed ? t("editProfile.saved") : t("editProfile.save")} onPress={submit} busy={busy} disabled={!changed || !!problem} />
      </View>
      <Button title={t("editProfile.done")} kind="secondary" onPress={() => router.back()} disabled={photoBusy || busy} />
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
