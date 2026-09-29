import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, colors, ErrorText, Muted, SectionTitle } from "../../components/ui";
import { db } from "../../firebase";
import {
  acceptRequest, cancelRequest, declineRequest, follow, relationshipTo, removeFriend,
} from "../../lib/friends";
import { findByUsername, type Profile } from "../../lib/profile";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

export default function FriendsScreen() {
  const { profile: me } = useReadySession();
  const { graph, loaded } = useFriendGraph();
  const profiles = useProfiles([...graph.friends, ...graph.incoming, ...graph.outgoing]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(uid: string, fn: () => Promise<void>) {
    setPending(uid);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.warn(err);
      setError("That didn't work. Please try again.");
    } finally {
      setPending(null);
    }
  }

  function confirmRemove(p: Profile) {
    Alert.alert(
      `Remove ${p.displayName}?`,
      "You'll stop seeing each other's posts right away. You can send a new request later.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => act(p.uid, () => removeFriend(db, me.uid, p.uid)) },
      ],
    );
  }

  const row = (uid: string, actions: React.ReactNode) => {
    const p = profiles.get(uid);
    return (
      <View key={uid} style={styles.row}>
        <View style={styles.who}>
          <Text style={styles.name}>{p?.displayName ?? "…"}</Text>
          {p && <Muted>@{p.username}</Muted>}
        </View>
        <View style={styles.rowActions}>{actions}</View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <FindFriend me={me.uid} graph={graph} />
      {error && <ErrorText>{error}</ErrorText>}

      {graph.incoming.size > 0 && <SectionTitle>Requests</SectionTitle>}
      {[...graph.incoming].map((uid) =>
        row(uid, (
          <>
            <Button title="Accept" onPress={() => act(uid, () => acceptRequest(db, me.uid, uid))} busy={pending === uid} />
            <Button title="Decline" kind="secondary" onPress={() => act(uid, () => declineRequest(db, me.uid, uid))} disabled={pending === uid} />
          </>
        )),
      )}

      <SectionTitle>Friends</SectionTitle>
      {!loaded && <Muted>Loading…</Muted>}
      {loaded && graph.friends.size === 0 && <Muted>No friends yet. Find someone by their username above.</Muted>}
      {[...graph.friends].map((uid) =>
        row(uid, (
          <Button
            title="Remove"
            kind="danger"
            busy={pending === uid}
            onPress={() => { const p = profiles.get(uid); if (p) confirmRemove(p); }}
          />
        )),
      )}

      {graph.outgoing.size > 0 && <SectionTitle>Sent</SectionTitle>}
      {[...graph.outgoing].map((uid) =>
        row(uid, <Button title="Cancel" kind="secondary" busy={pending === uid} onPress={() => act(uid, () => cancelRequest(db, me.uid, uid))} />),
      )}
    </ScrollView>
  );
}

function FindFriend({ me, graph }: { me: string; graph: ReturnType<typeof useFriendGraph>["graph"] }) {
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
      setError("Search failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send(p: Profile) {
    setBusy(true);
    try {
      await follow(db, me, p.uid);
    } catch {
      setError("Couldn't send the request.");
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
          onChangeText={(t) => { setText(t); setResult(null); }}
          onSubmitEditing={search}
          placeholder="Find by username"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        <Button title="Find" kind="secondary" onPress={search} busy={busy && !result} disabled={!text.trim()} />
      </View>
      {result === "none" && <Muted>Nobody with that username.</Muted>}
      {result && result !== "none" && (
        <View style={styles.row}>
          <View style={styles.who}>
            <Text style={styles.name}>{result.displayName}</Text>
            <Muted>@{result.username}</Muted>
          </View>
          {rel === "none" && <Button title="Add friend" onPress={() => send(result)} busy={busy} />}
          {rel === "incoming" && <Button title="Accept" onPress={() => send(result)} busy={busy} />}
          {rel === "outgoing" && <Muted>Request sent</Muted>}
          {rel === "friend" && <Muted>Friends</Muted>}
          {rel === "self" && <Muted>That&apos;s you</Muted>}
        </View>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  find: { gap: 8 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, backgroundColor: colors.card, minHeight: 48 },
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
  who: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  rowActions: { flexDirection: "row", gap: 8 },
});
