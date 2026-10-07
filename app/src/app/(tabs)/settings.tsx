import { useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text, useColors } from "../../components/ui";
import { db } from "../../firebase";
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from "../../lib/appearance";
import { openPhoneSettings, setNotificationsEnabled, useNotificationPermission, useNotificationsEnabled } from "../../lib/notifications";
import { TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { unblockUser } from "../../lib/moderation";
import { useBlocked, useSettings } from "../../session/hooks";
import { useProfiles } from "../../session/useProfiles";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const settings = useSettings();
  const appearance = useAppearance();
  const notifications = useNotificationPermission();
  const notificationsOn = useNotificationsEnabled();
  const colors = useColors();

  async function toggleNotifications(on: boolean) {
    setNotificationsEnabled(on);
    // Turning on for the first time asks iOS; if iOS was refused before,
    // only the phone's Settings can change it (the note below says so).
    if (on && notifications.status === "undetermined") await notifications.request();
  }
  const [error, setError] = useState<string | null>(null);

  async function choose(id: TranslationId) {
    setError(null);
    try {
      await setBibleVersion(db, profile.uid, id);
    } catch {
      setError("Couldn't save. Please try again.");
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <SectionTitle>Notifications</SectionTitle>
      <View style={styles.card}>
        <View style={styles.option}>
          <Text style={styles.optionText}>Prompt notifications</Text>
          <Switch
            value={notificationsOn && notifications.status === "granted"}
            onValueChange={toggleNotifications}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel="Prompt notifications"
          />
        </View>
        <Muted>
          {notifications.status === "denied" && notificationsOn
            ? "Blocked in your phone's Settings. Turn them on there to be notified."
            : notificationsOn && notifications.status === "granted"
              ? "On: you'll be notified when it's time to pray."
              : "Off: turn on to be notified at the daily moment to pray."}
        </Muted>
        {notifications.status === "denied" && notificationsOn && (
          <Button title="Open phone Settings" kind="secondary" onPress={openPhoneSettings} />
        )}
      </View>

      <SectionTitle>Appearance</SectionTitle>
      <View style={styles.card}>
        {APPEARANCE_OPTIONS.map((o) => (
          <Option key={o.id} label={o.label} selected={appearance === o.id} onPress={() => setAppearance(o.id)} />
        ))}
        <Muted>Dark is easier on the eyes for evening prayer. &quot;Match phone&quot; follows your phone&apos;s setting.</Muted>
      </View>

      <SectionTitle>Bible translation</SectionTitle>
      <View style={styles.card}>
        {TRANSLATIONS.map((t) => (
          <Option key={t.id} label={`${t.name} (${t.id})`} selected={settings.bibleVersion === t.id} onPress={() => choose(t.id)} />
        ))}
        <Muted>Verses with each day&apos;s prompt are shown in this translation. More translations will come later.</Muted>
      </View>
      {error && <ErrorText>{error}</ErrorText>}

      <BlockedPeople />

      <View style={styles.spacer} />
      <Button title="Sign out" kind="secondary" onPress={() => signOut()} />
    </ScrollView>
  );
}

/** People I've blocked, with Unblock. Unblocking doesn't restore the friendship. */
function BlockedPeople() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const blocked = useBlocked();
  const names = useProfiles([...blocked]);
  if (blocked.size === 0) return null;
  return (
    <>
      <SectionTitle>Blocked people</SectionTitle>
      <View style={styles.card}>
        {[...blocked].map((uid) => (
          <View key={uid} style={styles.option}>
            <Text style={styles.optionText}>{names.get(uid)?.displayName ?? "…"}</Text>
            <Button title="Unblock" kind="secondary" onPress={() => unblockUser(db, profile.uid, uid).catch(() => {})} />
          </View>
        ))}
        <Muted>They don&apos;t know they&apos;re blocked. Unblocking doesn&apos;t make you friends again; either of you can send a new request.</Muted>
      </View>
    </>
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.option}>
      <Text style={styles.optionText}>{label}</Text>
      {selected && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  optionText: { fontSize: 17, color: colors.text },
  check: { fontSize: 18, color: colors.accent, fontFamily: fonts.serifSemiBold },
  spacer: { height: 16 },
}));
