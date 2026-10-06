import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text } from "../../components/ui";
import { db } from "../../firebase";
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from "../../lib/appearance";
import { openPhoneSettings, useNotificationPermission } from "../../lib/notifications";
import { TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { useSettings } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const settings = useSettings();
  const appearance = useAppearance();
  const notifications = useNotificationPermission();
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
        {notifications.status === "granted" && <Text style={styles.optionText}>On: you&apos;ll be notified when it&apos;s time to pray.</Text>}
        {notifications.status === "undetermined" && (
          <>
            <Muted>Get a notification at the daily moment to pray.</Muted>
            <Button title="Turn on notifications" onPress={notifications.request} />
          </>
        )}
        {notifications.status === "denied" && (
          <>
            <Muted>Notifications are off for this app. You can turn them on in your phone&apos;s Settings.</Muted>
            <Button title="Open phone Settings" kind="secondary" onPress={openPhoneSettings} />
          </>
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

      <View style={styles.spacer} />
      <Button title="Sign out" kind="secondary" onPress={() => signOut()} />
    </ScrollView>
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
