import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { initialOf } from "../../components/PrayForToday";
import { fonts, makeStyles, Muted, Text, useColors } from "../../components/ui";
import { db } from "../../firebase";
import { locale, t } from "../../i18n";
import { arrangeList, swapOrder, type PrayerItem } from "../../lib/prayerList";
import { useReadySession } from "../../session/SessionProvider";
import { groupLabel, usePrayerList } from "../../session/usePrayerList";

/**
 * My prayer list: everyone and everything I pray for, by group, then the
 * answered ones. Tap one to edit it, mark it answered or remove it. Only mine.
 */
export default function PrayerListScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const { items, loaded } = usePrayerList();
  const [ordering, setOrdering] = useState(false);
  const { groups, answered } = arrangeList(items);

  function move(list: PrayerItem[], i: number, by: -1 | 1) {
    const other = list[i + by];
    if (!other) return;
    swapOrder(db, profile.uid, list[i], other).catch(() => Alert.alert(t("plist.didntWork")));
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: t("plist.title"),
          headerRight: () => (
            <Pressable onPress={() => router.push("/prayer-list/edit")} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.headerButton}>+ {t("plist.add")}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.note}>
        <Ionicons name="lock-closed" size={14} color={colors.accent} />
        <Text style={styles.noteText}>{t("plist.private")}</Text>
      </View>
      {loaded && items.length === 0 && <Muted>{t("plist.empty")}</Muted>}
      {groups.length > 0 && (
        <Pressable onPress={() => setOrdering(!ordering)} accessibilityRole="button" style={styles.reorder} hitSlop={6}>
          <Ionicons name={ordering ? "checkmark-circle-outline" : "swap-vertical"} size={18} color={colors.accent} />
          <Text style={styles.headerButton}>{ordering ? t("plist.doneReorder") : t("plist.reorder")}</Text>
        </Pressable>
      )}
      {groups.map(({ group, items: list }) => (
        <View key={group} style={styles.group}>
          <Text style={styles.label} accessibilityRole="header">{groupLabel(group)}</Text>
          {list.map((item, i) => (
            <Pressable
              key={item.id}
              disabled={ordering}
              onPress={() => router.push({ pathname: "/prayer-list/edit", params: { id: item.id } })}
              onLongPress={() => router.push({ pathname: "/prayer-list/edit", params: { id: item.id } })}
              accessibilityRole="button"
              style={styles.row}
            >
              <View style={styles.initial}><Text style={styles.initialText}>{initialOf(item.name)}</Text></View>
              <View style={styles.text}>
                <Text style={styles.name}>{item.name}</Text>
                {!!item.note && <Muted>{item.note}</Muted>}
              </View>
              {ordering ? (
                <>
                  <Pressable onPress={() => move(list, i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={t("plist.moveUp", { name: item.name })} hitSlop={6} style={i === 0 && styles.off}>
                    <Ionicons name="arrow-up-circle-outline" size={26} color={colors.accent} />
                  </Pressable>
                  <Pressable onPress={() => move(list, i, 1)} disabled={i === list.length - 1} accessibilityRole="button" accessibilityLabel={t("plist.moveDown", { name: item.name })} hitSlop={6} style={i === list.length - 1 && styles.off}>
                    <Ionicons name="arrow-down-circle-outline" size={26} color={colors.accent} />
                  </Pressable>
                </>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              )}
            </Pressable>
          ))}
        </View>
      ))}
      {answered.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.label} accessibilityRole="header">✦ {t("plist.answered")}</Text>
          {answered.map((item) => (
            <Pressable key={item.id} onPress={() => router.push({ pathname: "/prayer-list/edit", params: { id: item.id } })} accessibilityRole="button" style={[styles.row, styles.answered]}>
              <View style={styles.initial}><Text style={styles.initialText}>{initialOf(item.name)}</Text></View>
              <View style={styles.text}>
                <Text style={styles.name}>{item.name}</Text>
                <Muted>
                  {`✦ ${t("plist.answeredOn", { date: item.answered!.at.toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" }) })}`}
                  {item.answered!.note ? ` · “${item.answered!.note}”` : ""}
                </Muted>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  headerButton: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  note: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 10 },
  noteText: { flex: 1, fontSize: 14, color: colors.accent },
  reorder: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  group: { gap: 8, marginTop: 6 },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  answered: { opacity: 0.8 },
  initial: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  initialText: { fontSize: 16, fontFamily: fonts.display, color: colors.accent },
  text: { flex: 1, gap: 1 },
  name: { fontSize: 16, color: colors.text },
  off: { opacity: 0.3 },
}));
