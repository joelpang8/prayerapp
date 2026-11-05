import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput } from "../../components/ui";
import { db } from "../../firebase";
import { t } from "../../i18n";
import { haptics } from "../../lib/haptics";
import {
  addItem, ANSWER_NOTE_MAX, customGroups, editItem, GROUP_MAX, itemProblem, NAME_MAX, NOTE_MAX, OFTEN, PRESET_GROUPS, removeItem, setAnswered,
  type ItemInput, type Often, type PrayerItem,
} from "../../lib/prayerList";
import { useReadySession } from "../../session/SessionProvider";
import { groupLabel, usePrayerList } from "../../session/usePrayerList";

const BLANK: ItemInput = { name: "", note: "", group: "family", often: "weekly" };
const fromItem = (i: PrayerItem): ItemInput => ({ name: i.name, note: i.note, group: i.group, often: i.often });

/** Add someone to my list, or edit, mark answered or remove one. */
export default function EditPrayerItemScreen() {
  const styles = useStyles();
  // From a prayer request on my profile: the name and note come filled in.
  const { id, name: givenName, note: givenNote } = useLocalSearchParams<{ id?: string; name?: string; note?: string }>();
  const { profile } = useReadySession();
  const { items, loaded } = usePrayerList();
  const item = id ? items.find((i) => i.id === id) ?? null : null;
  const [draft, setDraft] = useState<ItemInput | null>(null);
  const form = draft ?? (item ? fromItem(item) : { ...BLANK, name: givenName ?? "", note: givenNote ?? "" });
  const set = (patch: Partial<ItemInput>) => setDraft({ ...form, ...patch });
  const [typingGroup, setTypingGroup] = useState(false);
  const [answerNote, setAnswerNote] = useState("");
  const [marking, setMarking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const problem = itemProblem(form);
  const groups = [...PRESET_GROUPS, ...customGroups(items)];
  const newGroup = typingGroup || !groups.includes(form.group);

  async function run(key: string, fn: () => Promise<void>, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      after?.();
    } catch (err) {
      console.warn("prayer list change failed", err);
      Alert.alert(t("plist.didntWork"));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    setTried(true);
    if (problem) return;
    void run("save", async () => {
      if (item) await editItem(db, profile.uid, item.id, form);
      else await addItem(db, profile.uid, form, items);
      haptics.done();
    }, () => router.back());
  }

  if (id && loaded && !item) {
    return (
      <View style={[styles.root, styles.content]}>
        <Stack.Screen options={{ title: t("plist.editTitle") }} />
        <Muted>{t("plist.didntWork")}</Muted>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: item ? t("plist.editTitle") : t("plist.addTitle"),
          headerRight: () => (
            <Pressable onPress={save} disabled={busy !== null} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.headerButton}>{t("plist.save")}</Text>
            </Pressable>
          ),
        }}
      />
      <Text style={styles.label}>{t("plist.who")}</Text>
      <TextInput value={form.name} onChangeText={(name) => set({ name })} placeholder={t("plist.whoPlaceholder")} maxLength={NAME_MAX + 5} style={styles.input} autoFocus={!id} />
      {tried && problem === "name" && <ErrorText>{t("plist.nameMissing")}</ErrorText>}
      {problem === "nameLong" && <ErrorText>{t("plist.nameLong", { max: NAME_MAX })}</ErrorText>}

      <Text style={styles.label}>{t("plist.note")}</Text>
      <TextInput value={form.note} onChangeText={(note) => set({ note })} placeholder={t("plist.notePlaceholder")} maxLength={NOTE_MAX + 5} multiline style={[styles.input, styles.multi]} />
      {problem === "noteLong" && <ErrorText>{t("plist.noteLong", { max: NOTE_MAX })}</ErrorText>}

      <Text style={styles.label}>{t("plist.group")}</Text>
      <View style={styles.chips}>
        {groups.map((g) => (
          <Chip key={g} label={groupLabel(g)} on={!newGroup && form.group === g} onPress={() => { setTypingGroup(false); set({ group: g }); }} />
        ))}
        <Chip label={`+ ${t("plist.newGroup")}`} on={newGroup} onPress={() => { setTypingGroup(true); set({ group: "" }); }} />
      </View>
      {newGroup && (
        <TextInput value={form.group} onChangeText={(group) => set({ group })} placeholder={t("plist.newGroupPlaceholder")} maxLength={GROUP_MAX} style={styles.input} />
      )}
      {(tried || form.group.length > GROUP_MAX) && problem === "group" && <ErrorText>{t("plist.groupMissing", { max: GROUP_MAX })}</ErrorText>}

      <Text style={styles.label}>{t("plist.often")}</Text>
      <View style={styles.chips}>
        {OFTEN.map((o: Often) => <Chip key={o} label={t(`plist.often.${o}`)} on={form.often === o} onPress={() => set({ often: o })} />)}
      </View>

      <Button title={t("plist.save")} onPress={save} busy={busy === "save"} disabled={busy !== null} size="large" />

      {item && (
        <View style={styles.more}>
          {item.answered ? (
            <Button title={t("plist.notAnswered")} kind="secondary" busy={busy === "answer"} onPress={() => run("answer", () => setAnswered(db, profile.uid, item.id, false))} />
          ) : marking ? (
            <>
              <TextInput value={answerNote} onChangeText={setAnswerNote} placeholder={t("plist.answerNotePlaceholder")} maxLength={ANSWER_NOTE_MAX} style={styles.input} autoFocus />
              <Button
                title={`✦ ${t("plist.confirmAnswered")}`}
                busy={busy === "answer"}
                onPress={() => run("answer", async () => { await setAnswered(db, profile.uid, item.id, true, answerNote); haptics.done(); }, () => router.back())}
              />
            </>
          ) : (
            <Button title={`✦ ${t("plist.markAnswered")}`} kind="secondary" onPress={() => setMarking(true)} />
          )}
          <Button
            title={t("plist.remove")}
            kind="danger"
            busy={busy === "remove"}
            onPress={() =>
              Alert.alert(t("plist.removeTitle", { name: item.name }), t("plist.removeBody"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("plist.remove"), style: "destructive", onPress: () => run("remove", () => removeItem(db, profile.uid, item.id), () => router.back()) },
              ])
            }
          />
        </View>
      )}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  headerButton: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 10 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 16 },
  multi: { minHeight: 80, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onAccent },
  more: { gap: 10, marginTop: 24 },
}));
