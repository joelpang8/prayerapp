import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, colors, ErrorText, Muted, SectionTitle, Screen } from "../../components/ui";
import { db } from "../../firebase";
import { TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { useSettings } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  const { profile } = useReadySession();
  const settings = useSettings();
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
    <Screen style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile.displayName}</Text>
        <Muted>@{profile.username}</Muted>
      </View>

      <SectionTitle>Bible translation</SectionTitle>
      <View style={styles.card}>
        {TRANSLATIONS.map((t) => {
          const selected = settings.bibleVersion === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(t.id)}
              style={styles.option}
            >
              <Text style={styles.optionText}>{t.name} ({t.id})</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
        <Muted>Verses with each day&apos;s prompt are shown in this translation. More translations will come later.</Muted>
      </View>
      {error && <ErrorText>{error}</ErrorText>}

      <View style={styles.spacer} />
      <Button title="Sign out" kind="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  name: { fontSize: 18, fontWeight: "600", color: colors.text },
  option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  optionText: { fontSize: 16, color: colors.text },
  check: { fontSize: 18, color: colors.accent, fontWeight: "700" },
  spacer: { height: 16 },
});
