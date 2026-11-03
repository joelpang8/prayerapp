import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput } from "../../components/ui";
import { db } from "../../firebase";
import { t } from "../../i18n";
import {
  cancelInvite, CIRCLE_NAME_MAX, circleNameProblem, deleteCircle, invitesLeft, inviteToCircle, leaveCircle, MAX_CIRCLE_PEOPLE,
  removeMember, renameCircle,
} from "../../lib/circles";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useCircle } from "../../session/useCircles";
import { useProfiles } from "../../session/useProfiles";

/**
 * A circle's members and settings. Everyone sees who's in it and can leave
 * (except the leader). The leader also renames it, invites more friends,
 * cancels invitations, removes members and deletes the circle.
 */
export default function CircleMembersScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useReadySession();
  const { circle, gone, loaded } = useCircle(id);
  const { graph } = useFriendGraph();
  const blocked = useBlocked();
  const leader = circle?.leaderId === me.uid;
  const canInvite = leader && circle
    ? [...graph.friends].filter((u) => !blocked.has(u) && !circle.memberIds.includes(u) && !circle.invitedIds.includes(u))
    : [];
  const people = useProfiles(new Set([...(circle?.memberIds ?? []), ...(circle?.invitedIds ?? []), ...canInvite]));
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.warn("circle change failed", err);
      Alert.alert(t("circles.didntWork"));
    } finally {
      setBusy(null);
    }
  }

  if (loaded && gone) {
    return (
      <View style={[styles.root, styles.content]}>
        <Stack.Screen options={{ title: t("circleMembers.title") }} />
        <Muted>{t("circle.gone")}</Muted>
      </View>
    );
  }
  if (!circle) return <View style={styles.root} />;
  const nameOf = (uid: string) => people.get(uid)?.displayName ?? "…";
  const editedName = name ?? circle.name;
  const nameProblem = circleNameProblem(editedName);
  const left = invitesLeft(circle);

  const person = (uid: string, right: React.ReactNode, label?: string) => (
    <View key={uid} style={styles.row}>
      <Avatar path={people.get(uid)?.avatarPath ?? null} name={nameOf(uid)} size={40} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>{nameOf(uid)}</Text>
        {!!label && <Muted>{label}</Muted>}
      </View>
      {right}
    </View>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: circle.name }} />

      {leader && (
        <View style={styles.block}>
          <Text style={styles.label}>{t("circleMembers.name")}</Text>
          <TextInput value={editedName} onChangeText={(v) => { setName(v); setSaved(false); }} maxLength={CIRCLE_NAME_MAX + 5} style={styles.input} />
          {nameProblem === "long" && <ErrorText>{t("circleNew.nameLong", { max: CIRCLE_NAME_MAX })}</ErrorText>}
          <Button
            title={saved ? t("circleMembers.saved") : t("circleMembers.saveName")}
            kind="secondary"
            busy={busy === "name"}
            disabled={!!nameProblem || editedName.trim() === circle.name}
            onPress={() => run("name", async () => { await renameCircle(db, circle.id, editedName); setName(null); setSaved(true); })}
          />
        </View>
      )}

      <Text style={styles.label}>{t("circleMembers.title")} ({circle.memberIds.length})</Text>
      {circle.memberIds.map((uid) =>
        person(
          uid,
          leader && uid !== me.uid ? (
            <Button
              title={t("circleMembers.remove")}
              kind="danger"
              busy={busy === uid}
              onPress={() =>
                Alert.alert(t("circleMembers.removeTitle", { name: nameOf(uid) }), t("circleMembers.removeBody"), [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("circleMembers.remove"), style: "destructive", onPress: () => run(uid, () => removeMember(db, circle.id, uid)) },
                ])
              }
            />
          ) : null,
          [uid === circle.leaderId ? t("circleMembers.leader") : "", uid === me.uid ? t("circleMembers.you") : ""].filter(Boolean).join(" · "),
        ),
      )}

      {leader && circle.invitedIds.length > 0 && (
        <>
          <Text style={styles.label}>{t("circleMembers.invited")} ({circle.invitedIds.length})</Text>
          {circle.invitedIds.map((uid) =>
            person(uid, <Button title={t("circleMembers.cancelInvite")} kind="secondary" busy={busy === uid} onPress={() => run(uid, () => cancelInvite(db, circle.id, uid))} />),
          )}
        </>
      )}

      {leader && (
        <>
          <Text style={styles.label}>{t("circleMembers.inviteMore")}</Text>
          {left === 0 ? (
            <Muted>{t("circleMembers.full", { max: MAX_CIRCLE_PEOPLE })}</Muted>
          ) : canInvite.length === 0 ? (
            <Muted>{t("circleMembers.noOneToInvite")}</Muted>
          ) : (
            canInvite.map((uid) =>
              person(uid, <Button title={t("circleMembers.invite")} busy={busy === uid} onPress={() => run(uid, () => inviteToCircle(db, circle.id, uid))} />),
            )
          )}
        </>
      )}

      <View style={styles.spacer} />
      {leader ? (
        <Button
          title={t("circleMembers.deleteCircle")}
          kind="danger"
          busy={busy === "delete"}
          onPress={() =>
            Alert.alert(t("circleMembers.deleteTitle", { name: circle.name }), t("circleMembers.deleteBody"), [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("circleMembers.deleteCircle"),
                style: "destructive",
                onPress: () => run("delete", async () => { await deleteCircle(db, circle.id); router.navigate("/friends"); }),
              },
            ])
          }
        />
      ) : (
        <Button
          title={t("circleMembers.leave")}
          kind="danger"
          busy={busy === "leave"}
          onPress={() =>
            Alert.alert(t("circleMembers.leaveTitle", { name: circle.name }), t("circleMembers.leaveBody"), [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("circleMembers.leave"),
                style: "destructive",
                onPress: () => run("leave", async () => { await leaveCircle(db, circle.id, me.uid); router.navigate("/friends"); }),
              },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  block: { gap: 8, marginBottom: 6 },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  names: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
  spacer: { height: 12 },
}));
