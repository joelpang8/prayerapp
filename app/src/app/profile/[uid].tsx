import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { colors, fonts, Muted } from "../../components/ui";
import { db } from "../../firebase";
import { watchBio } from "../../lib/profile";
import { useFriendGraph, useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

export default function ProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  const others = useProfiles(uid === me.uid ? [] : [uid]);
  const profile = uid === me.uid ? me : others.get(uid);
  const canSeeBio = uid === me.uid || graph.friends.has(uid);
  const bio = useBio(canSeeBio ? uid : null);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: profile?.displayName ?? "" }} />
      <Avatar path={profile?.avatarPath ?? null} name={profile?.displayName ?? ""} size={128} />
      <Text style={styles.name}>{profile?.displayName ?? "…"}</Text>
      {profile && <Muted>@{profile.username}</Muted>}
      <View style={styles.bio}>
        {!canSeeBio ? (
          <Muted>Only friends can see {profile?.displayName ?? "their"}&apos;s bio.</Muted>
        ) : bio === null ? null : bio ? (
          <Text style={styles.bioText}>{bio}</Text>
        ) : (
          <Muted>{uid === me.uid ? "You haven't written a bio yet. Add one in Settings." : "No bio yet."}</Muted>
        )}
      </View>
    </ScrollView>
  );
}

/**
 * The bio, live, while `uid` is set. The screen passes null as soon as the
 * friend graph says they're no longer a friend, which stops the listener and
 * drops the text from memory on the spot, before the server would refuse it.
 */
function useBio(uid: string | null): string | null {
  const [state, setState] = useState<{ uid: string; bio: string } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const stop = watchBio(db, uid, (bio) => setState({ uid, bio }), () => setState(null));
    return () => {
      stop();
      setState(null);
    };
  }, [uid]);
  return uid && state?.uid === uid ? state.bio : null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, alignItems: "center", gap: 6 },
  name: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.text, marginTop: 12, textAlign: "center" },
  bio: { marginTop: 16, alignSelf: "stretch", alignItems: "center" },
  bioText: { fontSize: 18, lineHeight: 26, fontFamily: fonts.serif, color: colors.text, textAlign: "center" },
});
