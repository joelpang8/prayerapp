import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { db } from "../firebase";
import { MAX_ANSWER_NOTE, type PrayerRequest } from "../lib/prayerRequests";
import { setRequestAnswered, type AboutDoc } from "../lib/profile";
import { prayFor, prayingByRequest, prayingCountText, prayingNamesText, stopPraying } from "../lib/praying";
import { useShowPrayingNames } from "../lib/prayingPrefs";
import { useMyPrayersFor, usePrayingForMe } from "../session/hooks";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { Button, fonts, makeStyles, Muted, Text, TextInput } from "./ui";
import { t } from "../i18n";
import { errorReason } from "../lib/errors";
import { haptics } from "../lib/haptics";
import { entryFromRequest, requestOnList } from "../lib/prayerList";
import { usePrayerList } from "../session/usePrayerList";

const BULLET_WIDTH = 12;

/**
 * The "Prayer requests" part of a profile, as a bullet list.
 *  - My own: how many friends are praying for each (names only if I've
 *    turned that on in Settings). Nothing is ever sent to me about it.
 *    I can mark one answered, with an optional note, or undo that.
 *  - A friend's: a gentle "I'll pray for this" toggle on each. Other
 *    friends never see who tapped or how many. An answered one shows
 *    "✦ Answered" (and its note) instead, and "You prayed for this" if I did.
 */
export function PrayerRequests({ uid, name, about }: { uid: string; name: string; about: AboutDoc }) {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const requests = about.requests;
  if (requests.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.label} accessibilityRole="header">{t("requests.title")}</Text>
      {uid === me.uid ? <MyRequests about={about} /> : <FriendRequests uid={uid} name={name} requests={requests} />}
    </View>
  );
}

/** "✦ Answered", and the note under it if there is one. */
function AnsweredMark({ note }: { note: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.answer, styles.indent]}>
      <Text style={styles.answerTitle}>✦ {t("requests.answered")}</Text>
      {!!note && <Text style={styles.answerNote}>{note}</Text>}
    </View>
  );
}

function MyRequests({ about }: { about: AboutDoc }) {
  const requests = about.requests;
  const { profile: me } = useReadySession();
  const [marking, setMarking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // "+ My prayer list": copy a request into my private list, so it comes up in Pray for today.
  const list = usePrayerList();
  const onList = (text: string) => requestOnList(list.items, text);

  async function setAnswered(id: string, value: string | null) {
    setBusy(true);
    try {
      await setRequestAnswered(db, me.uid, about, id, value);
      if (value !== null) haptics.done();
      setMarking(null);
      setNote("");
    } catch (err) {
      console.warn("answered request failed", err);
      Alert.alert(t("requests.didntWork"), errorReason(err));
    } finally {
      setBusy(false);
    }
  }

  const styles = useStyles();
  const { graph } = useFriendGraph();
  const showNames = useShowPrayingNames();
  const taps = usePrayingForMe(true);
  const praying = prayingByRequest(taps, requests, (u) => graph.friends.has(u));
  const people = useProfiles(showNames ? new Set([...praying.values()].flat()) : []);
  return (
    <>
      {requests.map((r, i) => {
        const who = r.id ? praying.get(r.id) ?? [] : [];
        const names = who.map((u) => people.get(u)?.displayName).filter((n): n is string => !!n);
        const line = who.length === 0 ? "" : showNames && names.length === who.length ? prayingNamesText(names) : prayingCountText(who.length);
        return (
          <View key={r.id ?? `line${i}`} style={styles.request}>
            <View accessible accessibilityLabel={[r.text, r.answered ? t("requests.answered") : "", line].filter(Boolean).join(". ")} style={styles.request}>
              <Bullet text={r.text} />
              {r.answered && <AnsweredMark note={r.answered.note} />}
              {!!line && <Text style={[styles.praying, styles.indent]}>🙏 {line}</Text>}
            </View>
            {r.id && marking === r.id ? (
              <View style={[styles.markBox, styles.indent]}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t("requests.answerNotePlaceholder")}
                  maxLength={MAX_ANSWER_NOTE}
                  style={styles.noteInput}
                  accessibilityLabel={t("requests.answerNotePlaceholder")}
                />
                <View style={styles.markActions}>
                  <Button title={t("requests.markAnswered")} onPress={() => setAnswered(r.id!, note)} busy={busy} />
                  <Button title={t("common.cancel")} kind="secondary" onPress={() => { setMarking(null); setNote(""); }} disabled={busy} />
                </View>
              </View>
            ) : r.id && (
              <View style={[styles.myActions, styles.indent]}>
              <Pressable
                onPress={() => (r.answered ? setAnswered(r.id!, null) : (setMarking(r.id!), setNote("")))}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={r.answered ? t("requests.unmarkA11y", { text: r.text }) : t("requests.markA11y", { text: r.text })}
                hitSlop={6}
                style={styles.markLink}
              >
                <Text style={styles.markLinkText}>{r.answered ? t("requests.notAnswered") : t("requests.wasAnswered")}</Text>
              </Pressable>
              {!r.answered && list.loaded && (onList(r.text) ? (
                <Text style={styles.onList}>✓ {t("requests.onMyList")}</Text>
              ) : (
                <Pressable
                  onPress={() => router.push({ pathname: "/prayer-list/edit", params: entryFromRequest(r.text) })}
                  accessibilityRole="button"
                  accessibilityLabel={t("requests.addToListA11y", { text: r.text })}
                  hitSlop={6}
                  style={styles.markLink}
                >
                  <Text style={styles.addToList}>+ {t("requests.addToList")}</Text>
                </Pressable>
              ))}
              </View>
            )}
          </View>
        );
      })}
      {requests.some((r) => !r.id) && (
        <Muted>{t("requests.saveOnce")}</Muted>
      )}
      <Muted>{t("requests.onlyYou")}</Muted>
    </>
  );
}

function FriendRequests({ uid, name, requests }: { uid: string; name: string; requests: PrayerRequest[] }) {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  const isFriend = graph.friends.has(uid);
  const mine = useMyPrayersFor(isFriend ? uid : null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(itemId: string) {
    setBusy(itemId);
    haptics.tap();
    try {
      if (mine.has(itemId)) await stopPraying(db, uid, me.uid, itemId);
      else await prayFor(db, uid, me.uid, itemId);
    } catch (err) {
      console.warn("pray tap failed", err);
      Alert.alert(t("requests.didntWork"), t("requests.tryAgain"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {requests.map((r, i) => {
        const praying = !!r.id && mine.has(r.id);
        if (r.answered) {
          return (
            <View key={r.id ?? `line${i}`} style={styles.request} accessible accessibilityLabel={[r.text, t("requests.answered"), r.answered.note, praying ? t("requests.youPrayed") : ""].filter(Boolean).join(". ")}>
              <Bullet text={r.text} />
              <AnsweredMark note={r.answered.note} />
              {praying && <Text style={[styles.praying, styles.indent]}>🙏 {t("requests.youPrayed")}</Text>}
            </View>
          );
        }
        return (
          <View key={r.id ?? `line${i}`} style={styles.request}>
            <Bullet text={r.text} />
            {r.id && isFriend && (
              <Pressable
                onPress={() => toggle(r.id!)}
                disabled={busy === r.id}
                accessibilityRole="button"
                accessibilityState={{ selected: praying, busy: busy === r.id }}
                accessibilityLabel={praying ? t("requests.prayingA11y", { text: r.text }) : t("requests.willPrayA11y", { text: r.text })}
                accessibilityHint={praying ? t("requests.stopHint") : t("requests.mayseeHint", { name })}
                style={[styles.pray, styles.indent, praying && styles.prayOn]}
                hitSlop={6}
              >
                <Text style={styles.prayText}>{praying ? t("requests.praying") : t("requests.willPray")}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {isFriend && requests.some((r) => r.id) && (
        <Muted>{t("requests.friendNote", { name })}</Muted>
      )}
    </>
  );
}

/** One request, after a bullet. (VoiceOver reads the text; the bullet is decoration.) */
function Bullet({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet} importantForAccessibility="no" accessibilityElementsHidden>•</Text>
      <Text style={[styles.text, styles.bulletText]}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bulletRow: { flexDirection: "row", gap: 8 },
  bullet: { fontSize: 16, lineHeight: 24, color: colors.accent, width: BULLET_WIDTH, textAlign: "center" },
  bulletText: { flex: 1 },
  // Lines under a request (who's praying, the button) line up with its text.
  indent: { marginLeft: BULLET_WIDTH + 8 },
  card: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  request: { gap: 6 },
  text: { fontSize: 16, lineHeight: 24, color: colors.text },
  praying: { fontSize: 15, color: colors.accent, fontFamily: fonts.bodySemiBold },
  pray: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: colors.accent },
  prayOn: { backgroundColor: colors.accentSoft },
  prayText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent },
  // Answered: the same quiet gold as answered posts.
  answer: { backgroundColor: colors.goldSoft, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: colors.gold, paddingHorizontal: 10, paddingVertical: 6, gap: 2, alignSelf: "flex-start" },
  answerTitle: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.gold },
  answerNote: { fontSize: 15, lineHeight: 21, fontFamily: fonts.bodyItalic, color: colors.text },
  markLink: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  myActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18 },
  addToList: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.accent },
  onList: { fontSize: 14, color: colors.muted },
  markLinkText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.muted },
  markBox: { gap: 8 },
  markActions: { flexDirection: "row", gap: 8 },
  noteInput: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, color: colors.text },
}));
