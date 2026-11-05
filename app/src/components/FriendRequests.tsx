import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { db } from "../firebase";
import { t } from "../i18n";
import { acceptRequest, declineRequest } from "../lib/friends";
import { haptics } from "../lib/haptics";
import { useBlocked } from "../session/hooks";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { Avatar } from "./Avatar";
import { Button, ErrorText, fonts, makeStyles, Muted, Text } from "./ui";

/** Pending friend requests I haven't answered (never from people I've blocked; they aren't told). */
export function useIncomingRequests(): string[] {
  const { graph } = useFriendGraph();
  const blocked = useBlocked();
  return [...graph.incoming].filter((uid) => !blocked.has(uid));
}

/**
 * Friend requests at the top of Activity (the bell), with Accept and
 * Decline right there, so a request can be answered from where it shows up.
 */
export function FriendRequests() {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const incoming = useIncomingRequests();
  const profiles = useProfiles(incoming);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (incoming.length === 0) return null;

  async function act(uid: string, fn: () => Promise<void>, accepted: boolean) {
    setPending(uid);
    setError(false);
    try {
      await fn();
      if (accepted) haptics.done();
    } catch (err) {
      console.warn("friend request answer failed", err);
      setError(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title} accessibilityRole="header">{t("activity.requests")}</Text>
      {incoming.map((uid) => {
        const p = profiles.get(uid);
        return (
          <View key={uid} style={styles.row}>
            <Pressable onPress={() => router.push({ pathname: "/profile/[uid]", params: { uid } })} accessibilityRole="link" style={styles.who}>
              <Avatar path={p?.avatarPath ?? null} name={p?.displayName ?? ""} size={40} />
              <View style={styles.names}>
                <Text style={styles.name} numberOfLines={1}>{p?.displayName ?? "…"}</Text>
                <Muted>{p ? `@${p.username} · ${t("activity.wantsToBeFriends")}` : t("activity.wantsToBeFriends")}</Muted>
              </View>
            </Pressable>
            <View style={styles.buttons}>
              <Button title={t("friends.accept")} onPress={() => act(uid, () => acceptRequest(db, me.uid, uid), true)} busy={pending === uid} />
              <Button title={t("friends.decline")} kind="secondary" onPress={() => act(uid, () => declineRequest(db, me.uid, uid), false)} disabled={pending === uid} />
            </View>
          </View>
        );
      })}
      {error && <ErrorText>{t("friends.didntWork")}</ErrorText>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 10, paddingBottom: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  row: { backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12, gap: 10 },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  names: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
  buttons: { flexDirection: "row", gap: 8 },
}));
