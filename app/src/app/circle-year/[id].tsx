import { Stack, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Button, fonts, makeStyles, Muted, Text, useColors } from "../../components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "../../firebase";
import { locale, t, tn } from "../../i18n";
import { loadCircleYear, visibleRequests } from "../../lib/circles";
import { circleYear, circleYearHtml, type CircleYear } from "../../lib/circleYear";
import { errorReason } from "../../lib/errors";
import { useBlocked, useHidden } from "../../session/hooks";
import { useCircle } from "../../session/useCircles";
import { useProfiles } from "../../session/useProfiles";

/**
 * "A year in this circle": the year's answered prayers and a few counts, a
 * keepsake any member can open and print (AirPrint). Read from Firestore
 * while the page is open and kept in memory; the app never saves it.
 */
export default function CircleYearScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circle, gone } = useCircle(id);
  const blocked = useBlocked();
  const { isHidden } = useHidden();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<{ key: string; year: CircleYear } | null>(null);
  const [failed, setFailed] = useState(false);
  const member = !!circle;
  const key = `${id}:${year}`;

  useEffect(() => {
    if (!member) return;
    let live = true;
    loadCircleYear(db, id, year).then(
      ({ created, answered }) => {
        const shown = (list: typeof created) => visibleRequests(list, blocked, (requestId) => isHidden({ circleId: id, requestId }));
        if (live) setData({ key, year: circleYear(shown(created), shown(answered), year) });
      },
      (err) => { console.warn("circle year failed", err); if (live) setFailed(true); },
    );
    return () => { live = false; };
    // blocked/hidden only filter; reloading on their change isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, year, member, key]);

  const summary = data?.key === key ? data.year : null;
  const people = useProfiles(new Set(summary?.answered.map((r) => r.authorId) ?? []));
  const nameOf = (uid: string) => people.get(uid)?.displayName ?? "…";
  const when = (d: Date | null) => (d ? d.toLocaleDateString(locale(), { month: "long", day: "numeric" }) : "");
  const stats = summary
    ? [tn("circleYear.requests", summary.requests), tn("circleYear.prayers", summary.prayers), tn("circleYear.answered", summary.answered.length)].join(" · ")
    : "";

  async function print() {
    if (!summary || !circle) return;
    try {
      // Straight to the print screen: no file is made.
      await Print.printAsync({
        html: circleYearHtml({
          title: t("circleYear.title", { year: summary.year }),
          subtitle: circle.name,
          stats,
          empty: t("circleYear.empty"),
          items: summary.answered.map((r) => ({ name: nameOf(r.authorId), text: r.text, note: r.answered?.note ?? "", when: when(r.answered?.at ?? null) })),
        }),
      });
    } catch (err) {
      Alert.alert(t("circles.didntWork"), errorReason(err));
    }
  }

  if (gone) {
    return (
      <View style={[styles.root, styles.content]}>
        <Stack.Screen options={{ title: t("circleYear.short") }} />
        <Muted>{t("circle.gone")}</Muted>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("circleYear.short") }} />
      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear(year - 1)} accessibilityRole="button" accessibilityLabel={t("circleYear.previous")} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{t("circleYear.title", { year })}</Text>
        <Pressable onPress={() => setYear(Math.min(thisYear, year + 1))} disabled={year >= thisYear} accessibilityRole="button" accessibilityLabel={t("circleYear.next")} hitSlop={10} style={year >= thisYear && styles.off}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </Pressable>
      </View>
      {circle && <Muted>{circle.name}</Muted>}
      {failed && <Muted>{t("circles.didntWork")}</Muted>}
      {summary && (
        <>
          <Text style={styles.stats}>{stats}</Text>
          {summary.answered.length === 0 ? (
            <Muted>{t("circleYear.empty")}</Muted>
          ) : (
            summary.answered.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.text}>“{r.text}”</Text>
                <Muted>{`${nameOf(r.authorId)} · ${when(r.answered?.at ?? null)}`}</Muted>
                {!!r.answered?.note && <Text style={styles.note}>✦ {r.answered.note}</Text>}
              </View>
            ))
          )}
          <Button title={t("circleYear.print")} kind="secondary" onPress={print} />
          <Muted>{t("circleYear.privacy")}</Muted>
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, textAlign: "center", fontSize: 22, fontFamily: fonts.display, color: colors.text },
  off: { opacity: 0.3 },
  stats: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  text: { fontSize: 16, color: colors.text },
  note: { fontSize: 15, color: colors.gold, backgroundColor: colors.goldSoft, borderRadius: 8, padding: 8, marginTop: 4 },
}));
