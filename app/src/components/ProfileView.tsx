import { useEffect, useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { db } from "../firebase";
import { follow, relationshipTo } from "../lib/friends";
import { unblockUser } from "../lib/moderation";
import { useBlocked } from "../session/hooks";
import { bibleVersionLabel, denominationLabel } from "../lib/faith";
import { formatBirthday, watchAbout, type AboutDoc } from "../lib/profile";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { Avatar } from "./Avatar";
import { MoreMenu } from "./MoreMenu";
import { PrayerRequests } from "./PrayerRequests";
import { Button, fonts, makeStyles, Muted, Text } from "./ui";
import { t } from "../i18n";

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
    ? [about.bibleVersion && `📖 ${about.bibleVersion}`, about.denomination && `⛪ ${denominationLabel(about.denomination)}`].filter((t): t is string => !!t)
    : [];

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      Alert.alert(t("common.didntWork"), t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }
  const details: [string, string][] = about
    ? ([
        [t("profile.from"), about.hometown],
        [t("profile.birthday"), about.birthday ? formatBirthday(about.birthday) : ""],
        [t("profile.bibleVersion"), about.bibleVersion ? bibleVersionLabel(about.bibleVersion) : ""],
        [t("profile.denomination"), about.denomination ? denominationLabel(about.denomination) : ""],
        [t("profile.church"), about.church],
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
            <Button title={t("profile.unblock")} kind="secondary" busy={busy} onPress={() => act(() => unblockUser(db, me.uid, uid))} />
          ) : relation === "friend" ? (
            <Text style={styles.relation}>{t("profile.friends")}</Text>
          ) : relation === "outgoing" ? (
            <Text style={styles.relation}>{t("profile.requestSent")}</Text>
          ) : (
            <Button
              title={relation === "incoming" ? t("profile.acceptRequest") : t("profile.addFriend")}
              busy={busy}
              onPress={() => act(() => follow(db, me.uid, uid))}
            />
          )}
          <MoreMenu target={{ kind: "user", targetUid: uid }} name={profile.displayName} />
        </View>
      )}
      <View style={styles.bio}>
        {!canSeeBio ? (
          <Muted>{profile ? t("profile.onlyFriendsSee", { name: profile.displayName }) : t("profile.onlyFriendsSeeTheir")}</Muted>
        ) : about === null ? null : about.bio ? (
          <Text style={styles.bioText}>{about.bio}</Text>
        ) : (
          <Muted>{isMe ? t("profile.noBioMine") : t("profile.noBio")}</Muted>
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
  relation: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  name: { fontSize: 26, fontFamily: fonts.displayBold, color: colors.text, marginTop: 12, textAlign: "center" },
  bio: { marginTop: 16, marginBottom: 16, alignSelf: "stretch", alignItems: "center" },
  bioText: { fontSize: 17, lineHeight: 26, fontFamily: fonts.body, color: colors.text, textAlign: "center" },
  details: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  detail: { gap: 2 },
  detailLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 16, lineHeight: 24, color: colors.text },
}));
