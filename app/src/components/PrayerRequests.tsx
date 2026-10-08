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

/**
 * The "Prayer requests" part of a profile, one request per line.
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
      <Text style={styles.label} accessibilityRole="header">Prayer requests</Text>
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
            <Text style={styles.text}>{r.text}</Text>
            {!!line && <Text style={styles.praying}>🙏 {line}</Text>}
          </View>
        );
      })}
      {requests.some((r) => !r.id) && (
        <Muted>Save your profile once to let friends pray for each request separately.</Muted>
      )}
      <Muted>Only you see this. Friends aren&apos;t shown who else is praying.</Muted>
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
    try {
      if (mine.has(itemId)) await stopPraying(db, uid, me.uid, itemId);
      else await prayFor(db, uid, me.uid, itemId);
    } catch (err) {
      console.warn("pray tap failed", err);
      Alert.alert("That didn't work", "Please try again.");
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
            <Text style={styles.text}>{r.text}</Text>
            {r.id && isFriend && (
              <Pressable
                onPress={() => toggle(r.id!)}
                disabled={busy === r.id}
                accessibilityRole="button"
                accessibilityState={{ selected: praying, busy: busy === r.id }}
                accessibilityLabel={praying ? `Praying for: ${r.text}` : `I'll pray for: ${r.text}`}
                accessibilityHint={praying ? "Double-tap to stop" : `${name} may see that you're praying for this`}
                style={[styles.pray, praying && styles.prayOn]}
                hitSlop={6}
              >
                <Text style={styles.prayText}>{praying ? "✓ Praying" : "🙏 I'll pray for this"}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {isFriend && requests.some((r) => r.id) && (
        <Muted>{name} may see that you&apos;re praying. Other friends won&apos;t. Tap again to undo.</Muted>
      )}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  request: { gap: 6 },
  text: { fontSize: 17, lineHeight: 24, color: colors.text },
  praying: { fontSize: 15, color: colors.accent, fontFamily: fonts.serifSemiBold },
  pray: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: colors.accent },
  prayOn: { backgroundColor: colors.accentSoft },
  prayText: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent },
}));
