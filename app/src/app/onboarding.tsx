import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signOut } from "../auth/signIn";
import { Button, colors, ErrorText, Muted } from "../components/ui";
import { db } from "../firebase";
import {
  createProfile, displayNameProblem, normalizeUsername, usernameProblem, UsernameTakenError,
} from "../lib/profile";
import { getSuggestedDisplayName, useSession } from "../session/SessionProvider";

export default function OnboardingScreen() {
  const session = useSession();
  const [displayName, setDisplayName] = useState(getSuggestedDisplayName() ?? "");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status !== "needsProfile") return null;
  const normalized = normalizeUsername(username);
  const problem = username ? usernameProblem(normalized) : null;

  async function submit() {
    if (session.status !== "needsProfile") return;
    const nameIssue = displayNameProblem(displayName);
    const userIssue = usernameProblem(normalized);
    if (nameIssue || userIssue) {
      setError(nameIssue ?? userIssue);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createProfile(db, session.user.uid, normalized, displayName);
      // SessionProvider's profile listener moves us on from here.
    } catch (err) {
      setError(err instanceof UsernameTakenError ? `@${normalized} is taken. Try another.` : "Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <Text style={styles.title}>Set up your profile</Text>
        <Muted>Friends find you by your username. You can&apos;t change it later, so choose carefully.</Muted>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} maxLength={50} autoCapitalize="words" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            placeholder="e.g. grace_h"
          />
          {problem && <Muted>{problem}</Muted>}
        </View>
        {error && <ErrorText>{error}</ErrorText>}
        <View style={styles.actions}>
          <Button title="Continue" onPress={submit} busy={busy} disabled={!username || !!problem} />
          <Button title="Use a different account" kind="secondary" onPress={() => signOut()} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, marginTop: 24 },
  field: { gap: 6, marginTop: 8 },
  label: { fontWeight: "600", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: colors.card },
  actions: { gap: 12, marginTop: 16 },
});
