import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar } from "../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../components/ui";
import { db, storage } from "../firebase";
import { photoBlob, pickAvatar } from "../lib/capture";
import {
  ABOUT_LIMITS, aboutProblem, birthdayValue, monthName, parseBirthday, removeAvatar, saveAbout, setAvatar, watchAbout,
  type About,
} from "../lib/profile";
import { useReadySession } from "../session/SessionProvider";

type BirthdayParts = { month: number | null; day: string; year: string };

const partsFrom = (value: string): BirthdayParts => {
  const b = parseBirthday(value);
  return b ? { month: b.month, day: String(b.day), year: b.year ? String(b.year) : "" } : { month: null, day: "", year: "" };
};

/** "" for no birthday, the stored value, or null if what's typed isn't a real date. */
function birthdayFrom(p: BirthdayParts): string | null {
  if (p.month === null && !p.day.trim() && !p.year.trim()) return "";
  if (p.month === null) return null;
  return birthdayValue(p.month, Number(p.day), p.year.trim() ? Number(p.year) : undefined);
}

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
  const [birthday, setBirthday] = useState<BirthdayParts>({ month: null, day: "", year: "" });
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
        setBirthday(partsFrom(about.birthday));
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

  const birthdayValueNow = birthdayFrom(birthday);
  const next: About | null = form && birthdayValueNow !== null ? { ...form, birthday: birthdayValueNow } : null;
  const problem = birthdayValueNow === null ? "That birthday isn't a real date." : next ? aboutProblem(next) : null;
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
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Birthday</Text>
            {birthday.month !== null && (
              <Pressable onPress={() => { setSavedNote(false); setBirthday({ month: null, day: "", year: "" }); }} hitSlop={8}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.months}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const selected = birthday.month === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => { setSavedNote(false); setBirthday((b) => ({ ...b, month: m })); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={monthName(m)}
                  style={[styles.month, selected && styles.monthSelected]}
                >
                  <Text style={[styles.monthText, selected && styles.monthTextSelected]}>{monthName(m).slice(0, 3)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.dayYear}>
            <TextInput
              value={birthday.day}
              onChangeText={(t) => { setSavedNote(false); setBirthday((b) => ({ ...b, day: t.replace(/\D/g, "") })); }}
              placeholder="Day"
              keyboardType="number-pad"
              maxLength={2}
              style={[styles.input, styles.day]}
            />
            <TextInput
              value={birthday.year}
              onChangeText={(t) => { setSavedNote(false); setBirthday((b) => ({ ...b, year: t.replace(/\D/g, "") })); }}
              placeholder="Year (optional)"
              keyboardType="number-pad"
              maxLength={4}
              style={[styles.input, styles.year]}
            />
          </View>
        </View>

        {field("prayerRequests", "Prayer requests", "What would you like your friends to pray for?", true)}
        {field("bibleVersion", "Bible version I read", "e.g. KJV, ESV, NIV")}
        {field("denomination", "Denomination", "e.g. Baptist, Catholic, non-denominational")}
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
  clear: { fontSize: 15, color: colors.accent },
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
  months: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  month: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, width: "15%", alignItems: "center" },
  monthSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  monthText: { fontSize: 15, color: colors.text },
  monthTextSelected: { color: colors.onAccent },
  dayYear: { flexDirection: "row", gap: 8 },
  day: { width: 90 },
  year: { flex: 1 },
}));
