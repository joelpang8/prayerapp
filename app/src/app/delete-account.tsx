import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { reauthenticate, revokeAppleToken, signOut } from "../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput } from "../components/ui";
import { functions } from "../firebase";
import { confirmed, CONFIRM_WORD, deleteAccountOnServer, forgetAccountOnDevice, WHAT_IS_DELETED } from "../lib/account";
import { useReadySession } from "../session/SessionProvider";

/**
 * Delete my account: says exactly what goes, asks the person to type DELETE
 * and sign in again, then the server removes everything (deleteAccount).
 */
export default function DeleteAccountScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const again = await reauthenticate();
      if (!again) return; // cancelled the sign-in
      if (again.appleAuthorizationCode) {
        // Apple asks apps to revoke its sign-in when an account is deleted.
        await revokeAppleToken(again.appleAuthorizationCode).catch((err) => console.warn("Apple token revoke failed", err));
      }
      await deleteAccountOnServer(functions);
      await forgetAccountOnDevice(profile.uid);
      await signOut().catch(() => {});
      Alert.alert("Your account has been deleted", "Thank you for praying with us.");
    } catch (err) {
      console.warn("account deletion failed", err);
      const code = String((err as { code?: string }).code ?? "");
      setError(code.includes("failed-precondition")
        ? "That took a little long. Please try again; you'll be asked to sign in once more."
        : "Couldn't finish deleting your account. Please check your connection and try again; it picks up where it stopped.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">Delete your account</Text>
      <Text style={styles.body}>This permanently removes:</Text>
      <View style={styles.list}>
        {WHAT_IS_DELETED.map((line) => (
          <Text key={line} style={styles.item}>•  {line}</Text>
        ))}
      </View>
      <Muted>Friends won&apos;t be told. Your prayers simply stop appearing for them.</Muted>
      <Text style={styles.label}>Type {CONFIRM_WORD} to confirm</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
        style={styles.input}
      />
      <Muted>You&apos;ll be asked to sign in once more, to make sure it&apos;s you.</Muted>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Delete my account" kind="danger" busy={busy} disabled={!confirmed(typed) || busy} onPress={run} />
      <Button title="Cancel" kind="secondary" disabled={busy} onPress={() => router.back()} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.text },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  list: { gap: 6 },
  item: { fontSize: 17, lineHeight: 24, color: colors.text },
  label: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.text, marginTop: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 18, letterSpacing: 2 },
}));
