import { router, useScrollToTop } from "expo-router";
import { useState, useRef } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text, TextInput } from "../../components/ui";
import { db } from "../../firebase";
import {
  acceptRequest, cancelRequest, declineRequest, follow, relationshipTo, removeFriend,
} from "../../lib/friends";
import { shareInvite } from "../../lib/invite";
import { findByUsername, type Profile } from "../../lib/profile";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";
import { t } from "../../i18n";

export default function FriendsScreen() {
  // Tapping this tab again scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const { graph, loaded } = useFriendGraph();
  const blocked = useBlocked();
  // A blocked person can still send a request (so they aren't told), but it never shows here.
  const incoming = [...graph.incoming].filter((uid) => !blocked.has(uid));
  const profiles = useProfiles([...graph.friends, ...incoming, ...graph.outgoing]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(uid: string, fn: () => Promise<void>) {
    setPending(uid);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.warn(err);
      setError(t("friends.didntWork"));
    } finally {
      setPending(null);
    }
  }

  function confirmRemove(p: Profile) {
    Alert.alert(
      t("friends.removeTitle", { name: p.displayName }),
      t("friends.removeMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("friends.remove"), style: "destructive", onPress: () => act(p.uid, () => removeFriend(db, me.uid, p.uid)) },
      ],
    );
  }

  const row = (uid: string, actions: React.ReactNode) => {
    const p = profiles.get(uid);
    return (
      <View key={uid} style={styles.row}>
        <Who profile={p} uid={uid} />
        <View style={styles.rowActions}>{actions}</View>
      </View>
    );
  };

  return (
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button title={t("profile.invite")} onPress={() => shareInvite(me.username).catch(() => {})} />
      <Muted>{t("friends.inviteNote")}</Muted>
      <View style={styles.spacer} />
      <FindFriend me={me.uid} graph={graph} />
      {error && <ErrorText>{error}</ErrorText>}

      {incoming.length > 0 && <SectionTitle>{t("friends.requests")}</SectionTitle>}
      {incoming.map((uid) =>
        row(uid, (
          <>
            <Button title={t("friends.accept")} onPress={() => act(uid, () => acceptRequest(db, me.uid, uid))} busy={pending === uid} />
            <Button title={t("friends.decline")} kind="secondary" onPress={() => act(uid, () => declineRequest(db, me.uid, uid))} disabled={pending === uid} />
          </>
        )),
      )}

      <SectionTitle>{t("friends.friends")}</SectionTitle>
      {!loaded && <Muted>{t("friends.loading")}</Muted>}
      {loaded && graph.friends.size === 0 && (
        <EmptyState icon="people-circle-outline" title={t("friends.emptyTitle")} message={t("friends.emptyMessage")} />
      )}
      {[...graph.friends].map((uid) =>
        row(uid, (
          <Button
            title={t("friends.remove")}
            kind="danger"
            busy={pending === uid}
            onPress={() => { const p = profiles.get(uid); if (p) confirmRemove(p); }}
          />
        )),
      )}

      {graph.outgoing.size > 0 && <SectionTitle>{t("friends.sent")}</SectionTitle>}
      {[...graph.outgoing].map((uid) =>
        row(uid, <Button title={t("common.cancel")} kind="secondary" busy={pending === uid} onPress={() => act(uid, () => cancelRequest(db, me.uid, uid))} />),
      )}
    </ScrollView>
  );
}

/** Photo, name and username; tapping opens their profile. */
function Who({ profile, uid }: { profile: Profile | undefined; uid: string }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${uid}`)} style={styles.who}>
      <Avatar path={profile?.avatarPath ?? null} name={profile?.displayName ?? ""} size={44} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>{profile?.displayName ?? "…"}</Text>
        {profile && <Muted>@{profile.username}</Muted>}
      </View>
    </Pressable>
  );
}

function FindFriend({ me, graph }: { me: string; graph: ReturnType<typeof useFriendGraph>["graph"] }) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Profile | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      setResult((await findByUsername(db, text)) ?? "none");
    } catch {
      setError(t("friends.searchFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function send(p: Profile) {
    setBusy(true);
    try {
      await follow(db, me, p.uid);
    } catch {
      setError(t("friends.couldntSend"));
    } finally {
      setBusy(false);
    }
  }

  const rel = result && result !== "none" ? relationshipTo(graph, me, result.uid) : null;

  return (
    <View style={styles.find}>
      <View style={styles.searchRow}>
        <TextInput
          value={text}
          onChangeText={(value) => { setText(value); setResult(null); }}
          onSubmitEditing={search}
          placeholder={t("friends.findPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        <Button title={t("friends.find")} kind="secondary" onPress={search} busy={busy && !result} disabled={!text.trim()} />
      </View>
      {result === "none" && <Muted>{t("friends.nobody")}</Muted>}
      {result && result !== "none" && (
        <View style={styles.row}>
          <Who profile={result} uid={result.uid} />
          {rel === "none" && <Button title={t("friends.addFriend")} onPress={() => send(result)} busy={busy} />}
          {rel === "incoming" && <Button title={t("friends.accept")} onPress={() => send(result)} busy={busy} />}
          {rel === "outgoing" && <Muted>{t("friends.requestSent")}</Muted>}
          {rel === "friend" && <Muted>{t("friends.isFriend")}</Muted>}
          {rel === "self" && <Muted>{t("friends.thatsYou")}</Muted>}
        </View>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  find: { gap: 8 },
  spacer: { height: 16 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, minHeight: 48 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  rowActions: { flexDirection: "row", gap: 8 },
}));
