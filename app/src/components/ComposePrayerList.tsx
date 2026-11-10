import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { db } from "../firebase";
import { t } from "../i18n";
import { haptics } from "../lib/haptics";
import { lineFor, withLine } from "../lib/composeList";
import { addItem, arrangeList, NAME_MAX, PRESET_GROUPS, todaysPicks, type PrayerItem } from "../lib/prayerList";
import { saveLater } from "../lib/saveLater";
import { useReadySession } from "../session/SessionProvider";
import { groupLabel, useAppDay, usePrayedToday, usePrayerList } from "../session/usePrayerList";
import { fonts, makeStyles, Muted, Text, TextInput, useColors } from "./ui";

/**
 * At Pray now: pray for people on my prayer list (tapping one adds their
 * name to this prayer, which friends will see, and marks them ✓ Prayed for
 * today), or add someone to the list without leaving. Closed until opened.
 * Only names are ever added to the post, never the list's private notes.
 */
export function ComposePrayerList({ notes, onNotes }: { notes: string; onNotes: (n: string) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const { items, loaded } = usePrayerList();
  const day = useAppDay();
  const { prayed, toggle } = usePrayedToday(day);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("friends");
  const [added, setAdded] = useState<string | null>(null);
  if (!loaded) return null;

  const picks = todaysPicks(items, day);
  const rest = arrangeList(items).groups.flatMap((g) => g.items).filter((i) => !picks.some((p) => p.id === i.id));
  const shown: PrayerItem[] = all ? [...picks, ...rest] : picks;

  function use(item: PrayerItem) {
    onNotes(withLine(notes, lineFor(item.name)));
    if (!prayed.has(item.id)) toggle(item.id);
    haptics.tap();
  }

  function add() {
    const n = name.trim();
    if (!n || n.length > NAME_MAX) return;
    saveLater(addItem(db, profile.uid, { name: n, note: "", group, often: "weekly" }, items), t("plist.didntWork"), "prayer list add failed");
    setAdded(n);
    setName("");
    haptics.done();
  }

  return (
    <View style={styles.root}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.header} hitSlop={6}>
        <Ionicons name="list" size={18} color={colors.accent} />
        <Text style={styles.headerText}>{t("composeList.title")}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
      </Pressable>
      {open && (
        <>
          {items.length > 0 && (
            <>
              <Muted>{t("composeList.hint")}</Muted>
              <View style={styles.chips}>
                {shown.map((item) => {
                  const inPrayer = notes.split("\n").some((l) => l.trim() === lineFor(item.name));
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => use(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: inPrayer }}
                      accessibilityLabel={t("composeList.useA11y", { name: item.name })}
                      style={[styles.chip, inPrayer && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, inPrayer && styles.chipTextOn]}>{inPrayer ? `✓ ${item.name}` : item.name}</Text>
                    </Pressable>
                  );
                })}
                {!all && rest.length > 0 && (
                  <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={[styles.chip, styles.more]}>
                    <Text style={styles.moreText}>{t("composeList.more", { count: rest.length })}</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
          <Text style={styles.addLabel}>{t("composeList.addTitle")}</Text>
          <View style={styles.addRow}>
            <TextInput value={name} onChangeText={(v) => { setName(v); setAdded(null); }} placeholder={t("plist.whoPlaceholder")} maxLength={NAME_MAX} style={styles.input} returnKeyType="done" onSubmitEditing={add} />
            <Pressable onPress={add} disabled={!name.trim()} accessibilityRole="button" accessibilityLabel={t("composeList.add")} style={[styles.addButton, !name.trim() && styles.off]} hitSlop={6}>
              <Ionicons name="add" size={22} color={colors.onAccent} />
            </Pressable>
          </View>
          <View style={styles.chips}>
            {PRESET_GROUPS.map((g) => (
              <Pressable key={g} onPress={() => setGroup(g)} accessibilityRole="radio" accessibilityState={{ selected: group === g }} style={[styles.small, group === g && styles.chipOn]}>
                <Text style={[styles.smallText, group === g && styles.chipTextOn]}>{groupLabel(g)}</Text>
              </Pressable>
            ))}
          </View>
          {added && <Muted>{t("composeList.added", { name: added })}</Muted>}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerText: { flex: 1, fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onAccent },
  more: { borderStyle: "dashed" },
  moreText: { fontSize: 14, color: colors.accent },
  addLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.bg, fontSize: 15 },
  addButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.4 },
  small: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  smallText: { fontSize: 13, color: colors.text },
}));
