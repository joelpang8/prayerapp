import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { db } from "../firebase";
import type { PrayerRequest } from "../lib/prayerRequests";
import { prayFor, prayingByRequest, prayingCountText, prayingNamesText, stopPraying } from "../lib/praying";
import { useShowPrayingNames } from "../lib/prayingPrefs";
import { useMyPrayersFor, usePrayingForMe } from "../session/hooks";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { fonts, makeStyles, Muted, Text } from "./ui";
import { t } from "../i18n";
import { haptics } from "../lib/haptics";

const BULLET_WIDTH = 12;

/**
 * The "Prayer requests" part of a profile, as a bullet list.
 *  - My own: how many friends are praying for each (names only if I've
 *    turned that on in Settings). Nothing is ever sent to me about it.
 *  - A friend's: a gentle "I'll pray for this" toggle on each. Other
 *    friends never see who tapped or how many.
 */
export function PrayerRequests({ uid, name, requests }: { uid: string; name: string; requests: PrayerRequest[] }) {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  if (requests.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.label} accessibilityRole="header">{t("requests.title")}</Text>
      {uid === me.uid ? <MyRequests requests={requests} /> : <FriendRequests uid={uid} name={name} requests={requests} />}
    </View>
  );
}

function MyRequests({ requests }: { requests: PrayerRequest[] }) {
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
          <View key={r.id ?? `line${i}`} style={styles.request} accessible accessibilityLabel={line ? `${r.text}. ${line}.` : r.text}>
            <Bullet text={r.text} />
            {!!line && <Text style={[styles.praying, styles.indent]}>🙏 {line}</Text>}
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
  bullet: { fontSize: 17, lineHeight: 24, color: colors.accent, width: BULLET_WIDTH, textAlign: "center" },
  bulletText: { flex: 1 },
  // Lines under a request (who's praying, the button) line up with its text.
  indent: { marginLeft: BULLET_WIDTH + 8 },
  card: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  request: { gap: 6 },
  text: { fontSize: 17, lineHeight: 24, color: colors.text },
  praying: { fontSize: 15, color: colors.accent, fontFamily: fonts.serifSemiBold },
  pray: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: colors.accent },
  prayOn: { backgroundColor: colors.accentSoft },
  prayText: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent },
}));
