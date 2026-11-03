import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { db } from "../firebase";
import { t, tn } from "../i18n";
import { acceptInvite, declineInvite, type Circle } from "../lib/circles";
import { useReadySession } from "../session/SessionProvider";
import { useCircleHasNew, useMyCircles } from "../session/useCircles";
import { useProfiles } from "../session/useProfiles";
import { CirclePhoto } from "./CirclePhoto";
import { Button, fonts, makeStyles, Muted, Text, useColors } from "./ui";

/**
 * Prayer circles at the top of the Friends tab: invitations (Join or
 * Decline), the circles I'm in (with a "New" dot), and "New circle".
 */
export function CirclesSection() {
  const styles = useStyles();
  const { circles, invites, loaded } = useMyCircles();
  const leaders = useProfiles(new Set(invites.map((c) => c.leaderId)));
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.section} accessibilityRole="header">{t("circles.title")}</Text>
        <Pressable onPress={() => router.push("/circle/new")} accessibilityRole="button" accessibilityLabel={t("circles.newA11y")} hitSlop={10}>
          <Text style={styles.newLink}>+ {t("circles.new")}</Text>
        </Pressable>
      </View>
      {invites.map((c) => <InviteRow key={c.id} circle={c} leaderName={leaders.get(c.leaderId)?.displayName ?? "…"} />)}
      {circles.map((c) => <CircleRow key={c.id} circle={c} />)}
      {loaded && circles.length === 0 && invites.length === 0 && <Muted>{t("circles.empty")}</Muted>}
    </View>
  );
}

function CircleRow({ circle }: { circle: Circle }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const hasNew = useCircleHasNew(circle.id);
  const detail = [tn("circles.members", circle.memberIds.length), circle.leaderId === profile.uid ? t("circles.youLead") : ""].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/circle/[id]", params: { id: circle.id } })}
      accessibilityRole="link"
      accessibilityLabel={[circle.name, detail, hasNew ? t("circles.newDot") : ""].filter(Boolean).join(". ")}
      style={styles.row}
    >
      <CirclePhoto path={circle.photoPath} size={44} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>{circle.name}</Text>
        <Muted>{detail}</Muted>
      </View>
      {hasNew && <Text style={styles.dot}>{t("circles.newDot")}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function InviteRow({ circle, leaderName }: { circle: Circle; leaderName: string }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn("circle invite failed", err);
      Alert.alert(t("circles.didntWork"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[styles.row, styles.invite]}>
      <CirclePhoto path={circle.photoPath} size={44} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>{circle.name}</Text>
        <Muted>{t("circles.invitedBy", { name: leaderName })}</Muted>
      </View>
      <View style={styles.inviteActions}>
        <Button title={t("circles.join")} onPress={() => act(() => acceptInvite(db, circle.id, profile.uid))} busy={busy} />
        <Button title={t("circles.decline")} kind="secondary" onPress={() => act(() => declineInvite(db, circle.id, profile.uid))} disabled={busy} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8, marginBottom: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  section: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  newLink: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  invite: { flexWrap: "wrap", borderStyle: "dashed", borderColor: colors.accent, backgroundColor: colors.accentSoft },
  inviteActions: { flexDirection: "row", gap: 8, width: "100%", justifyContent: "flex-end" },
  names: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  dot: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.onAccent, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
}));
