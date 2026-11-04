import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { t, tn } from "../i18n";
import { todaysPicks } from "../lib/prayerList";
import { haptics } from "../lib/haptics";
import { groupLabel, useAppDay, usePrayedToday, usePrayerList } from "../session/usePrayerList";
import { Button, fonts, makeStyles, Muted, Text, useColors } from "./ui";

/**
 * "Pray for today" at the top of the Prayers tab: a few from my prayer list
 * each day (lib/prayerList.ts todaysPicks), each with Pray / ✓ Prayed.
 * With an empty list, an invitation to start one. Only mine.
 */
export function PrayForToday() {
  const styles = useStyles();
  const colors = useColors();
  const { items, loaded } = usePrayerList();
  const day = useAppDay();
  const { prayed, toggle } = usePrayedToday(day);
  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="list" size={20} color={colors.accent} />
          <Text style={styles.title} accessibilityRole="header">{t("plist.startTitle")}</Text>
        </View>
        <Muted>{t("plist.startBody")}</Muted>
        <Button title={t("plist.start")} kind="secondary" onPress={() => router.push("/prayer-list/edit")} />
      </View>
    );
  }

  const picks = todaysPicks(items, day);
  return (
    <View style={[styles.card, styles.today]}>
      <Text style={styles.kicker}>{t("plist.todayKicker")}</Text>
      <Text style={styles.title} accessibilityRole="header">{picks.length ? tn("plist.todayTitle", picks.length) : t("plist.todayNone")}</Text>
      {picks.map((item, i) => {
        const done = prayed.has(item.id);
        return (
          <View key={item.id} style={[styles.row, i > 0 && styles.rowLine]}>
            <View style={styles.initial}><Text style={styles.initialText}>{initialOf(item.name)}</Text></View>
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Muted>{[groupLabel(item.group), item.note].filter(Boolean).join(" · ")}</Muted>
            </View>
            <Pressable
              onPress={() => { if (!done) haptics.tap(); toggle(item.id); }}
              accessibilityRole="button"
              accessibilityState={{ selected: done }}
              accessibilityLabel={done ? t("plist.prayedA11y", { name: item.name }) : t("plist.prayA11y", { name: item.name })}
              hitSlop={6}
              style={[styles.pray, done && styles.prayDone]}
            >
              <Text style={[styles.prayText, done && styles.prayDoneText]}>{done ? `✓ ${t("plist.prayed")}` : `🙏 ${t("plist.pray")}`}</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable onPress={() => router.push("/prayer-list")} accessibilityRole="link" hitSlop={6} style={styles.footer}>
        <Muted>{t("plist.todayFooter")}</Muted>
        <Text style={styles.link}>{t("plist.seeList")} ›</Text>
      </Pressable>
    </View>
  );
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "•";
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, marginBottom: 16 },
  today: { backgroundColor: colors.accentSoft, gap: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  kicker: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  title: { fontSize: 18, fontFamily: fonts.display, color: colors.text, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  initial: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  initialText: { fontSize: 16, fontFamily: fonts.display, color: colors.accent },
  text: { flex: 1, gap: 1 },
  name: { fontSize: 16, color: colors.text },
  pray: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  prayDone: { backgroundColor: colors.accent },
  prayText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.accent },
  prayDoneText: { color: colors.onAccent },
  footer: { marginTop: 6, gap: 2 },
  link: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.accent },
}));
