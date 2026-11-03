import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../../components/ui";
import { db } from "../../firebase";
import { t } from "../../i18n";
import { CIRCLE_NAME_MAX, circleNameProblem, createCircle, MAX_CIRCLE_PEOPLE } from "../../lib/circles";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

/** Start a circle: a name, then tick friends to invite (they join only if they accept). */
export default function NewCircleScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  const blocked = useBlocked();
  const friends = [...graph.friends].filter((u) => !blocked.has(u));
  const profiles = useProfiles(friends);
  const sorted = [...friends].sort((a, b) => (profiles.get(a)?.displayName ?? "").localeCompare(profiles.get(b)?.displayName ?? ""));
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = circleNameProblem(name);
  const maxInvites = MAX_CIRCLE_PEOPLE - 1;

  function toggle(uid: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(uid) && next.size < maxInvites) next.add(uid);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const id = await createCircle(db, me.uid, name, [...picked]);
      router.replace({ pathname: "/circle/[id]", params: { id } });
    } catch (err) {
      console.warn("create circle failed", err);
      setError(t("circles.didntWork"));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("circleNew.title") }} />
      <View style={styles.field}>
        <Text style={styles.label}>{t("circleNew.name")}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={t("circleNew.namePlaceholder")} maxLength={CIRCLE_NAME_MAX + 5} style={styles.input} autoFocus />
        {problem === "long" && <ErrorText>{t("circleNew.nameLong", { max: CIRCLE_NAME_MAX })}</ErrorText>}
      </View>

      <View style={styles.header}>
        <Text style={styles.label}>{t("circleNew.invite")}</Text>
        <Muted>{t("circleNew.count", { n: picked.size, max: maxInvites })}</Muted>
      </View>
      {friends.length === 0 && <Muted>{t("circleNew.noFriends")}</Muted>}
      {sorted.map((uid) => {
        const p = profiles.get(uid);
        const on = picked.has(uid);
        return (
          <Pressable key={uid} onPress={() => toggle(uid)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.row}>
            <Avatar path={p?.avatarPath ?? null} name={p?.displayName ?? ""} size={40} />
            <View style={styles.names}>
              <Text style={styles.name} numberOfLines={1}>{p?.displayName ?? "…"}</Text>
              {p && <Muted>@{p.username}</Muted>}
            </View>
            <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={26} color={on ? colors.accent : colors.border} />
          </Pressable>
        );
      })}
      <Muted>{t("circleNew.note")}</Muted>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title={t("circleNew.create")} onPress={create} busy={busy} disabled={!!problem} size="large" />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10, paddingBottom: 48 },
  field: { gap: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  names: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
}));
