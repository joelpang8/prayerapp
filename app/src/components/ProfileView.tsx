import { useEffect, useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { db } from "../firebase";
import { follow, relationshipTo } from "../lib/friends";
import { unblockUser } from "../lib/moderation";
import { useBlocked } from "../session/hooks";
import { bibleVersionLabel } from "../lib/faith";
import { formatBirthday, watchAbout, type AboutDoc } from "../lib/profile";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { Avatar } from "./Avatar";
import { MoreMenu } from "./MoreMenu";
import { PrayerRequests } from "./PrayerRequests";
import { Button, fonts, makeStyles, Muted, Text } from "./ui";

/**
 * Someone's profile: photo, name, username, and the friends-only details
 * (bio, hometown, birthday, prayer requests, Bible version, denomination,
 * church) if
 * I'm allowed to see them (myself, or a current friend). Used by the Profile tab and by
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
  const about = useAbout(canSeeBio ? uid : null);
  const blocked = useBlocked();
  const [busy, setBusy] = useState(false);
  const relation = relationshipTo(graph, me.uid, uid);
  // Tags from their friends-only details: the Bible they read, their tradition.
  const tags = about
    ? [about.bibleVersion && `📖 ${about.bibleVersion}`, about.denomination && `⛪ ${about.denomination}`].filter((t): t is string => !!t)
    : [];

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      Alert.alert("That didn't work", "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const details: [string, string][] = about
    ? ([
        ["From", about.hometown],
        ["Birthday", about.birthday ? formatBirthday(about.birthday) : ""],
        ["Bible version", about.bibleVersion ? bibleVersionLabel(about.bibleVersion) : ""],
        ["Denomination", about.denomination],
        ["Church", about.church],
      ] as [string, string][]).filter(([, v]) => v)
    : [];

  return (
    <View style={styles.root}>
      <Avatar path={profile?.avatarPath ?? null} name={profile?.displayName ?? ""} size={128} />
      <Text style={styles.name}>{profile?.displayName ?? "…"}</Text>
      {profile && <Muted>@{profile.username}</Muted>}
      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((t) => (
            <Text key={t} style={styles.tag}>{t}</Text>
          ))}
        </View>
      )}
      {!isMe && profile && (
        <View style={styles.relationRow}>
          {blocked.has(uid) ? (
            <Button title="Unblock" kind="secondary" busy={busy} onPress={() => act(() => unblockUser(db, me.uid, uid))} />
          ) : relation === "friend" ? (
            <Text style={styles.relation}>✓ Friends</Text>
          ) : relation === "outgoing" ? (
            <Text style={styles.relation}>Request sent</Text>
          ) : (
            <Button
              title={relation === "incoming" ? "Accept friend request" : "Add friend"}
              busy={busy}
              onPress={() => act(() => follow(db, me.uid, uid))}
            />
          )}
          <MoreMenu target={{ kind: "user", targetUid: uid }} name={profile.displayName} />
        </View>
      )}
      <View style={styles.bio}>
        {!canSeeBio ? (
          <Muted>Only friends can see {profile?.displayName ?? "their"}&apos;s bio and details.</Muted>
        ) : about === null ? null : about.bio ? (
          <Text style={styles.bioText}>{about.bio}</Text>
        ) : (
          <Muted>{isMe ? "You haven't written a bio yet." : "No bio yet."}</Muted>
        )}
      </View>
      {details.length > 0 && (
        <View style={styles.details}>
          {details.map(([label, value]) => (
            <View key={label} style={styles.detail}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
        </View>
      )}
      {about && profile && <PrayerRequests uid={uid} name={profile.displayName} requests={about.requests} />}
      {actions}
    </View>
  );
}

/**
 * The friends-only details, live, while `uid` is set. ProfileView passes
 * null as soon as the friend graph says they're no longer a friend, which
 * stops the listener and drops the details from memory on the spot, before
 * the server would refuse them.
 */
function useAbout(uid: string | null): AboutDoc | null {
  const [state, setState] = useState<{ uid: string; about: AboutDoc } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const stop = watchAbout(db, uid, (about) => setState({ uid, about }), () => setState(null));
    return () => {
      stop();
      setState(null);
    };
  }, [uid]);
  return uid && state?.uid === uid ? state.about : null;
}

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", gap: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 6 },
  tag: { fontSize: 15, color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, overflow: "hidden" },
  relationRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  relation: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
  name: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.text, marginTop: 12, textAlign: "center" },
  bio: { marginTop: 16, marginBottom: 16, alignSelf: "stretch", alignItems: "center" },
  bioText: { fontSize: 18, lineHeight: 26, fontFamily: fonts.serif, color: colors.text, textAlign: "center" },
  details: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  detail: { gap: 2 },
  detailLabel: { fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 17, lineHeight: 24, color: colors.text },
}));
