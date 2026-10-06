import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { db } from "../firebase";
import { watchBio } from "../lib/profile";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { Avatar } from "./Avatar";
import { fonts, makeStyles, Muted, Text } from "./ui";

/**
 * Someone's profile: photo, name, username, and the bio if I'm allowed to
 * see it (myself, or a current friend). Used by the Profile tab and by
 * other people's profile pages.
 */
export function ProfileView({ uid, actions }: { uid: string; actions?: ReactNode }) {
  const styles = useStyles();
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  const isMe = uid === me.uid;
  const others = useProfiles(isMe ? [] : [uid]);
  const profile = isMe ? me : others.get(uid);
  const canSeeBio = isMe || graph.friends.has(uid);
  const bio = useBio(canSeeBio ? uid : null);

  return (
    <View style={styles.root}>
      <Avatar path={profile?.avatarPath ?? null} name={profile?.displayName ?? ""} size={128} />
      <Text style={styles.name}>{profile?.displayName ?? "…"}</Text>
      {profile && <Muted>@{profile.username}</Muted>}
      <View style={styles.bio}>
        {!canSeeBio ? (
          <Muted>Only friends can see {profile?.displayName ?? "their"}&apos;s bio.</Muted>
        ) : bio === null ? null : bio ? (
          <Text style={styles.bioText}>{bio}</Text>
        ) : (
          <Muted>{isMe ? "You haven't written a bio yet." : "No bio yet."}</Muted>
        )}
      </View>
      {actions}
    </View>
  );
}

/**
 * The bio, live, while `uid` is set. ProfileView passes null as soon as the
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

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", gap: 6 },
  name: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.text, marginTop: 12, textAlign: "center" },
  bio: { marginTop: 16, marginBottom: 16, alignSelf: "stretch", alignItems: "center" },
  bioText: { fontSize: 18, lineHeight: 26, fontFamily: fonts.serif, color: colors.text, textAlign: "center" },
}));
