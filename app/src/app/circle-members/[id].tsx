import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { CirclePhoto } from "../../components/CirclePhoto";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../../components/ui";
import { db, storage } from "../../firebase";
import { photoBlob, pickAvatar } from "../../lib/capture";
import { locale, t } from "../../i18n";
import { errorReason } from "../../lib/errors";
import { SelectField } from "../../components/SelectField";
import { prayerTimeFrom, weekdayNames } from "../../lib/circleTime";
import {
  cancelInvite, CIRCLE_NAME_MAX, circleNameProblem, deleteCircle, invitesLeft, inviteToCircle, leaveCircle, MAX_CIRCLE_PEOPLE,
  approveJoin, declineJoin, makeLeader, removeCirclePhoto, removeMember, renameCircle, setCirclePhoto, setPrayerTime, turnOffLink, turnOnLink,
  type Circle, type PrayerTime,
} from "../../lib/circles";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useCircle, useJoinRequests, useMyCircles } from "../../session/useCircles";
import { useNotifyPrefs } from "../../session/useActivityNotifications";
import { useNotificationPermission } from "../../lib/notifications";
import { shareCircleLink } from "../../lib/circleLink";
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
  const [preview, setPreview] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.warn("circle change failed", err);
      Alert.alert(t("circles.didntWork"), errorReason(err));
    } finally {
      setBusy(null);
    }
  }

  async function changePhoto(source: "camera" | "library") {
    if (!circle) return;
    const photo = await pickAvatar(source).catch(() => null);
    if (!photo) return;
    setPreview(photo.previewUri);
    await run("photo", async () => setCirclePhoto(db, storage, circle, await photoBlob(photo.previewUri), photo.photoId));
    setPreview(null);
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

      <NotifySwitch circleId={circle.id} />

      {leader && (
        <View style={styles.block}>
          <Text style={styles.label}>{t("circleMembers.photo")}</Text>
          <View style={styles.photoRow}>
            <CirclePhoto path={circle.photoPath} size={72} previewUri={preview} />
            <View style={styles.photoButtons}>
              <Button title={t("editProfile.takePhoto")} kind="secondary" onPress={() => changePhoto("camera")} disabled={busy === "photo"} />
              <Button title={t("editProfile.choosePhoto")} kind="secondary" onPress={() => changePhoto("library")} busy={busy === "photo"} />
              {circle.photoPath && (
                <Button title={t("editProfile.remove")} kind="danger" onPress={() => run("photo", () => removeCirclePhoto(db, storage, circle))} disabled={busy === "photo"} />
              )}
            </View>
          </View>
        </View>
      )}

      {leader && <InviteLinkEditor circle={circle} />}

      {leader && <PrayerTimeEditor circle={circle} />}

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
            onPress={() => run("name", async () => { await renameCircle(db, circle.id, editedName, circle.linkCode); setName(null); setSaved(true); })}
          />
        </View>
      )}

      <Text style={styles.label}>{t("circleMembers.title")} ({circle.memberIds.length})</Text>
      {circle.memberIds.map((uid) =>
        person(
          uid,
          leader && uid !== me.uid ? (
            <View style={styles.memberActions}>
              <Button
                title={t("circleMembers.makeLeader")}
                kind="secondary"
                disabled={busy === uid}
                onPress={() =>
                  Alert.alert(t("circleMembers.makeLeaderTitle", { name: nameOf(uid) }), t("circleMembers.makeLeaderBody"), [
                    { text: t("common.cancel"), style: "cancel" },
                    { text: t("circleMembers.makeLeader"), onPress: () => run(uid, () => makeLeader(db, circle.id, uid)) },
                  ])
                }
              />
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
            </View>
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
      {leader && circle.memberIds.length > 1 && <Muted>{t("circleMembers.leaderLeaveHint")}</Muted>}
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
                onPress: () => run("delete", async () => { await deleteCircle(db, circle.id, { storage, path: circle.photoPath }, circle.linkCode); router.navigate("/circles"); }),
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
                onPress: () => run("leave", async () => { await leaveCircle(db, circle.id, me.uid); router.navigate("/circles"); }),
              },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

/**
 * The invite link: create, share or turn off; and the people who asked to
 * join with it, to approve or decline. Requests from people I've blocked
 * are left out (they aren't told).
 */
function InviteLinkEditor({ circle }: { circle: Circle }) {
  const styles = useStyles();
  const asks = useJoinRequests(circle.id, true);
  const blocked = useBlocked();
  const shown = asks.filter((a) => !blocked.has(a.uid));
  const people = useProfiles(shown.map((a) => a.uid));
  const [busy, setBusy] = useState<string | null>(null);
  const full = invitesLeft(circle) === 0;
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.warn("invite link failed", err);
      Alert.alert(t("circles.didntWork"), errorReason(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{t("circleLink.title")}</Text>
      <Muted>{t("circleLink.note")}</Muted>
      {circle.linkCode ? (
        <View style={styles.photoButtons}>
          <Button title={t("circleLink.share")} onPress={() => { void shareCircleLink(circle.name, circle.linkCode!).catch(() => {}); }} />
          <Button title={t("circleLink.off")} kind="secondary" busy={busy === "off"} onPress={() => run("off", () => turnOffLink(db, circle))} />
        </View>
      ) : (
        <Button title={t("circleLink.create")} kind="secondary" busy={busy === "on"} onPress={() => run("on", async () => {
          const code = await turnOnLink(db, circle);
          await shareCircleLink(circle.name, code).catch(() => {});
        })} />
      )}
      {shown.length > 0 && (
        <>
          <Text style={styles.label}>{t("circleLink.asked")} ({shown.length})</Text>
          {full && <Muted>{t("circleMembers.full", { max: MAX_CIRCLE_PEOPLE })}</Muted>}
          {shown.map((a) => (
            <View key={a.uid} style={styles.row}>
              <Avatar path={people.get(a.uid)?.avatarPath ?? null} name={people.get(a.uid)?.displayName ?? ""} size={40} />
              <View style={styles.names}>
                <Text style={styles.name} numberOfLines={1}>{people.get(a.uid)?.displayName ?? "…"}</Text>
                {people.get(a.uid) && <Muted>@{people.get(a.uid)!.username}</Muted>}
              </View>
              <Button title={t("circleLink.approve")} busy={busy === a.uid} disabled={full} onPress={() => run(a.uid, () => approveJoin(db, circle.id, a.uid))} />
              <Button title={t("circleLink.decline")} kind="secondary" disabled={busy === a.uid} onPress={() => run(a.uid, () => declineJoin(db, circle.id, a.uid))} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/** Every 15 minutes, as "HH:MM" values with the phone's way of writing times. */
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const hour = Math.floor(i / 4);
  const minute = (i % 4) * 15;
  return { hour, minute, value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
});

/** The leader sets the circle's weekly prayer time (in their own time zone) or removes it. */
function PrayerTimeEditor({ circle }: { circle: Circle }) {
  const styles = useStyles();
  const current = circle.prayerTime;
  const [day, setDay] = useState(String(current?.weekday ?? 2));
  const [time, setTime] = useState(current ? `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}` : "19:00");
  const [busy, setBusy] = useState(false);
  const days = weekdayNames(locale());
  const label = (h: number, m: number) => new Date(2026, 0, 5, h, m).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
  async function save(value: PrayerTime | null) {
    setBusy(true);
    try {
      await setPrayerTime(db, circle.id, value);
    } catch (err) {
      console.warn("prayer time failed", err);
      Alert.alert(t("circles.didntWork"), errorReason(err));
    } finally {
      setBusy(false);
    }
  }
  const [hh, mm] = time.split(":").map(Number);
  const chosen = prayerTimeFrom(Number(day), hh, mm);
  const unchanged = !!current && current.weekday === chosen.weekday && current.hour === chosen.hour && current.minute === chosen.minute && current.timeZone === chosen.timeZone;
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{t("circleTime.title")}</Text>
      <Muted>{t("circleTime.leaderNote")}</Muted>
      <View style={styles.timePickers}>
        <View style={styles.timePicker}>
          <SelectField title={t("circleTime.day")} value={day} onChange={setDay} options={days.map((d, i) => ({ value: String(i + 1), label: d }))} placeholder={t("circleTime.day")} noneLabel={null} />
        </View>
        <View style={styles.timePicker}>
          <SelectField title={t("circleTime.time")} value={time} onChange={setTime} options={TIMES.map((x) => ({ value: x.value, label: label(x.hour, x.minute) }))} placeholder={t("circleTime.time")} noneLabel={null} />
        </View>
      </View>
      <Button title={t("circleTime.save")} kind="secondary" onPress={() => save(chosen)} busy={busy} disabled={unchanged} />
      {current && <Button title={t("circleTime.clear")} kind="secondary" onPress={() => save(null)} disabled={busy} />}
    </View>
  );
}

/** My own opt-in: tell me about new and answered requests in this circle (off until turned on). */
function NotifySwitch({ circleId }: { circleId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { prefs, loaded, setCircle } = useNotifyPrefs();
  const mine = useMyCircles();
  const permission = useNotificationPermission();
  const [error, setError] = useState(false);
  const on = !!prefs?.circles.includes(circleId);
  async function toggle(value: boolean) {
    setError(false);
    if (value && permission.status !== "granted") await permission.request();
    const ids = new Set(mine.circles.map((c) => c.id));
    await setCircle(circleId, value, (c) => !mine.loaded || ids.has(c)).catch(() => setError(true));
  }
  return (
    <View style={styles.notifyRow}>
      <View style={styles.names}>
        <Text style={styles.name}>{t("circleMembers.notify")}</Text>
        <Muted>{t("circleMembers.notifyNote")}</Muted>
        {error && <ErrorText>{t("common.tryAgain")}</ErrorText>}
      </View>
      <Switch
        value={on}
        disabled={!loaded}
        onValueChange={(v) => { void toggle(v); }}
        trackColor={{ true: colors.accent, false: colors.border }}
        accessibilityLabel={t("circleMembers.notify")}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  notifyRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  block: { gap: 8, marginBottom: 6 },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  names: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
  spacer: { height: 12 },
  memberActions: { gap: 6 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  timePickers: { flexDirection: "row", gap: 8 },
  timePicker: { flex: 1 },
  photoButtons: { flex: 1, gap: 8 },
}));
