import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { CirclePhoto } from "../../components/CirclePhoto";
import { EmptyState } from "../../components/EmptyState";
import { MoreMenu } from "../../components/MoreMenu";
import { Button, fonts, makeStyles, Muted, Text, TextInput, useColors } from "../../components/ui";
import { setCircleReminder, useCircleReminderIds } from "../../lib/circleReminders";
import { describePrayerTime } from "../../lib/circleTime";
import { useNotificationPermission } from "../../lib/notifications";
import { db } from "../../firebase";
import { locale, t, tn } from "../../i18n";
import { saveLater } from "../../lib/saveLater";
import {
  addCircleRequest, arrangeRequests, CIRCLE_ANSWER_NOTE_MAX, CIRCLE_REQUEST_MAX, deleteCircleRequest, pinRequest, setCircleRequestAnswered, setPrayed,
  visibleRequests, type Circle, type CircleRequest,
} from "../../lib/circles";
import { haptics } from "../../lib/haptics";
import { useBlocked, useHidden } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";
import { useCircle, useJoinRequests, useMarkCircleSeen } from "../../session/useCircles";
import { useProfiles } from "../../session/useProfiles";

/**
 * A prayer circle: its shared prayer list. Members add requests, mark
 * "I prayed" on others' (once), and mark their own answered. Requests from
 * people I've blocked, or that I've reported, are left out (quietly).
 * Only current members can read any of it (firestore.rules).
 */
export default function CircleScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useReadySession();
  const { circle, requests, loaded, gone } = useCircle(id);
  const blocked = useBlocked();
  const { isHidden } = useHidden();
  useMarkCircleSeen(id);
  const shown = visibleRequests(requests, blocked, (requestId) => isHidden({ circleId: id, requestId }));
  const people = useProfiles(new Set([...(circle?.memberIds ?? []), ...shown.map((r) => r.authorId)]));
  const arranged = arrangeRequests(shown, circle?.pinnedRequestId ?? null);
  // People asking to join with the invite link (the leader sees them; blocked people never show).
  const asks = useJoinRequests(id, circle?.leaderId === me.uid).filter((a) => !blocked.has(a.uid));
  const [text, setText] = useState("");

  // Shown at once and sent when there's a connection (no spinner with no signal).
  function add() {
    saveLater(addCircleRequest(db, id, me.uid, text), t("circles.didntWork"), "add circle request failed");
    setText("");
    haptics.tap();
  }

  if (loaded && gone) {
    return (
      <View style={[styles.root, styles.content]}>
        <Stack.Screen options={{ title: t("circles.title") }} />
        <Muted>{t("circle.gone")}</Muted>
      </View>
    );
  }
  if (!circle) return <View style={styles.root} />;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: circle.name }} />
      <View style={styles.titleRow}>
        <CirclePhoto path={circle.photoPath} size={64} />
        <Text style={styles.title} accessibilityRole="header">{circle.name}</Text>
      </View>
      <Pressable
        onPress={() => router.push({ pathname: "/circle-members/[id]", params: { id } })}
        accessibilityRole="button"
        accessibilityLabel={`${t("circle.membersButton")}. ${tn("circles.members", circle.memberIds.length)}`}
        style={styles.members}
      >
        <View style={styles.stack}>
          {circle.memberIds.slice(0, 5).map((uid, i) => (
            <View key={uid} style={[styles.stackItem, i > 0 && styles.stackOverlap]}>
              <Avatar path={people.get(uid)?.avatarPath ?? null} name={people.get(uid)?.displayName ?? ""} size={30} />
            </View>
          ))}
        </View>
        <Muted>{tn("circles.members", circle.memberIds.length)}</Muted>
        <Text style={styles.link}>{t("circle.membersButton")} ›</Text>
      </Pressable>

      {asks.length > 0 && (
        <Pressable onPress={() => router.push({ pathname: "/circle-members/[id]", params: { id } })} accessibilityRole="button" style={styles.askBanner}>
          <Text style={styles.askText}>{tn("circleLink.askedBanner", asks.length)} ›</Text>
        </Pressable>
      )}
      {circle.prayerTime && <PrayerTimeRow circle={circle} />}

      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("circle.addPlaceholder")}
          multiline
          maxLength={CIRCLE_REQUEST_MAX}
          style={styles.addInput}
          accessibilityLabel={t("circle.addPlaceholder")}
        />
        <Button title={t("circle.add")} onPress={add} disabled={!text.trim()} />
      </View>

      {shown.length === 0 && <EmptyState icon="people-circle-outline" title={t("circle.emptyTitle")} message={t("circle.emptyBody")} />}
      {[...(arranged.pinned ? [arranged.pinned] : []), ...arranged.open].map((r) => (
        <RequestCard key={r.id} circle={circle} request={r} pinned={r === arranged.pinned} authorName={people.get(r.authorId)?.displayName ?? "…"} authorPhoto={people.get(r.authorId)?.avatarPath ?? null} />
      ))}
      {arranged.answered.length > 0 && (
        <>
          <Text style={styles.answeredHeader} accessibilityRole="header">✦ {tn("circle.answeredSection", arranged.answered.length)}</Text>
          {arranged.answered.map((r) => (
            <RequestCard key={r.id} circle={circle} request={r} pinned={false} authorName={people.get(r.authorId)?.displayName ?? "…"} authorPhoto={people.get(r.authorId)?.avatarPath ?? null} />
          ))}
        </>
      )}
      <Muted>{t("circle.onlyMembers")}</Muted>
    </ScrollView>
  );
}

/** "Prays together every Tuesday at 7:00 PM" (in my time), with my own reminder switch. */
function PrayerTimeRow({ circle }: { circle: Circle }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile: me } = useReadySession();
  const reminders = useCircleReminderIds(me.uid);
  const permission = useNotificationPermission();
  const on = reminders.has(circle.id);
  const [now] = useState(() => new Date());
  const { day, time } = describePrayerTime(circle.prayerTime!, now, locale());
  async function toggle(value: boolean) {
    if (value && permission.status !== "granted") await permission.request();
    setCircleReminder(me.uid, circle.id, value);
  }
  return (
    <View style={styles.timeRow}>
      <Ionicons name="time-outline" size={20} color={colors.accent} />
      <View style={styles.timeText}>
        <Text style={styles.timeLine}>{t("circleTime.every", { day, time })}</Text>
        <Muted>{t("circleTime.remindNote")}</Muted>
      </View>
      <Switch
        value={on}
        onValueChange={(v) => { void toggle(v); }}
        trackColor={{ true: colors.accent, false: colors.border }}
        accessibilityLabel={t("circleTime.remindMe")}
      />
    </View>
  );
}

function when(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString(locale(), { month: "short", day: "numeric" });
}

function RequestCard({ circle, request: r, pinned, authorName, authorPhoto }: { circle: Circle; request: CircleRequest; pinned: boolean; authorName: string; authorPhoto: string | null }) {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const mine = r.authorId === me.uid;
  const prayed = r.prayedBy.includes(me.uid);
  const leader = circle.leaderId === me.uid;
  const [marking, setMarking] = useState(false);
  const [note, setNote] = useState("");

  // Shown at once and sent when there's a connection; told if the server refuses.
  function run(fn: () => Promise<void>) {
    saveLater(fn(), t("circles.didntWork"), "circle request action failed");
  }

  const confirmDelete = () =>
    Alert.alert(t("circle.deleteTitle"), t("circle.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("circle.delete"), style: "destructive", onPress: () => run(() => deleteCircleRequest(db, circle.id, r.id)) },
    ]);

  return (
    <View style={[styles.card, r.answered && styles.cardAnswered, pinned && styles.cardPinned]}>
      {pinned && <Text style={styles.pinnedLabel}>📌 {t("circle.pinned")}</Text>}
      <View style={styles.who}>
        <Avatar path={authorPhoto} name={authorName} size={28} />
        <Text style={styles.author} numberOfLines={1}>{authorName}</Text>
        <Muted>{when(r.createdAt)}</Muted>
        {!mine && (
          <MoreMenu target={{ kind: "circleRequest", targetUid: r.authorId, circleId: circle.id, requestId: r.id, excerpt: r.text }} name={authorName} />
        )}
      </View>
      <Text style={styles.text}>{r.text}</Text>
      {r.answered && (
        <View style={styles.answer}>
          <Text style={styles.answerTitle}>✦ {t("circle.answered")}</Text>
          {!!r.answered.note && <Text style={styles.answerNote}>{r.answered.note}</Text>}
        </View>
      )}
      <View style={styles.actions}>
        {!mine && !r.answered && (
          <Pressable
            onPress={() => { haptics.tap(); run(() => setPrayed(db, circle.id, r.id, me.uid, !prayed)); }}
            accessibilityRole="button"
            accessibilityState={{ selected: prayed }}
            accessibilityLabel={prayed ? t("circle.prayedA11y") : t("circle.willPrayA11y")}
            style={[styles.pray, prayed && styles.prayOn]}
            hitSlop={6}
          >
            <Text style={styles.prayText}>{prayed ? t("circle.prayed") : t("circle.willPray")}</Text>
          </Pressable>
        )}
        {r.prayedBy.length > 0 && <Muted>{tn("circle.prayedCount", r.prayedBy.length)}</Muted>}
      </View>
      {!marking && (mine || leader) && (
        <View style={styles.ownActions}>
          {mine && (
            <Pressable onPress={() => (r.answered ? run(() => setCircleRequestAnswered(db, circle.id, r.id, null)) : (setMarking(true), setNote("")))} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.small}>{r.answered ? t("circle.notAnswered") : t("circle.wasAnswered")}</Text>
            </Pressable>
          )}
          {leader && !r.answered && (
            <Pressable onPress={() => run(() => pinRequest(db, circle.id, pinned ? null : r.id))} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.small}>{pinned ? t("circle.unpin") : t("circle.pin")}</Text>
            </Pressable>
          )}
          <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.small}>{t("circle.delete")}</Text>
          </Pressable>
        </View>
      )}
      {mine && marking && (
        <View style={styles.markBox}>
          <TextInput value={note} onChangeText={setNote} placeholder={t("circle.answerPlaceholder")} maxLength={CIRCLE_ANSWER_NOTE_MAX} style={styles.noteInput} accessibilityLabel={t("circle.answerPlaceholder")} />
          <View style={styles.ownActions}>
            <Button title={t("circle.markAnswered")} onPress={() => { run(() => setCircleRequestAnswered(db, circle.id, r.id, note)); haptics.done(); setMarking(false); }} />
            <Button title={t("common.cancel")} kind="secondary" onPress={() => setMarking(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  askBanner: { backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12 },
  askText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  timeText: { flex: 1, gap: 2 },
  timeLine: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.text },
  title: { flex: 1, fontSize: 26, fontFamily: fonts.displayBold, color: colors.text },
  members: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 44 },
  stack: { flexDirection: "row" },
  stackItem: { borderRadius: 17, borderWidth: 2, borderColor: colors.bg },
  stackOverlap: { marginLeft: -10 },
  link: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent, marginLeft: "auto" },
  addRow: { gap: 8 },
  addInput: { minHeight: 60, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.card, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  cardAnswered: { borderColor: colors.gold },
  cardPinned: { borderColor: colors.accent, borderWidth: 2 },
  pinnedLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.accent },
  answeredHeader: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.gold, marginTop: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 8 },
  author: { flex: 1, fontSize: 16, fontFamily: fonts.display, color: colors.text },
  text: { fontSize: 16, lineHeight: 23, color: colors.text },
  answer: { backgroundColor: colors.goldSoft, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.gold, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  answerTitle: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.gold },
  answerNote: { fontSize: 15, lineHeight: 21, fontFamily: fonts.bodyItalic, color: colors.text },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pray: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.accent },
  prayOn: { backgroundColor: colors.accentSoft },
  prayText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  ownActions: { flexDirection: "row", gap: 16, alignItems: "center", flexWrap: "wrap" },
  small: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.muted },
  markBox: { gap: 8 },
  noteInput: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, fontSize: 15 },
}));
