import { router } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import { db } from "../firebase";
import { t } from "../i18n";
import { BirthdayStore } from "../lib/birthdays";
import { useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { fonts, makeStyles, Text } from "./ui";

/**
 * "Birthdays today" on Today: current friends whose shared birthday is
 * today (the phone's day), with a gentle nudge to pray for them. Tapping a
 * name opens their profile. Nothing shows on other days.
 */
export function BirthdayCard({ now }: { now: number }) {
  const styles = useStyles();
  const { scope } = useReadySession();
  const [store] = useState(() => new BirthdayStore(db, scope));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const version = useSyncExternalStore(
    (l) => store.subscribe(l),
    () => store.today(new Date(now)).join(","),
  );
  const uids = version ? version.split(",") : [];
  const people = useProfiles(uids);
  const named = uids.map((uid) => ({ uid, name: people.get(uid)?.displayName })).filter((p): p is { uid: string; name: string } => !!p.name);
  if (named.length === 0) return null;
  const names = named.map((p) => p.name);
  const message = named.length === 1
    ? t("todayBirthday.one", { name: names[0] })
    : t("todayBirthday.many", { names: names.join(", ") });
  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">🎂 {t("todayBirthday.title")}</Text>
      <Text style={styles.text}>{message}</Text>
      <View style={styles.names}>
        {named.map((p) => (
          <Pressable
            key={p.uid}
            onPress={() => router.push(`/profile/${p.uid}`)}
            accessibilityRole="link"
            accessibilityLabel={t("todayBirthday.openProfile", { name: p.name })}
            hitSlop={6}
            style={styles.name}
          >
            <Text style={styles.nameText}>{p.name} ›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.goldSoft, borderRadius: 16, borderWidth: 1, borderColor: colors.gold, padding: 16, gap: 6, marginBottom: 16 },
  title: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.gold, textTransform: "uppercase", letterSpacing: 0.8 },
  text: { fontSize: 16, lineHeight: 24, color: colors.text },
  names: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  name: { minHeight: 36, justifyContent: "center" },
  nameText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
}));
