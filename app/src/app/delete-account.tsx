import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { reauthenticate, revokeAppleToken, signOut } from "../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput } from "../components/ui";
import { functions } from "../firebase";
import { t } from "../i18n";
import { confirmed, CONFIRM_WORD, deleteAccountOnServer, forgetAccountOnDevice, whatIsDeleted } from "../lib/account";
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
      Alert.alert(t("account.deleted.title"), t("account.deleted.message"));
    } catch (err) {
      console.warn("account deletion failed", err);
      const code = String((err as { code?: string }).code ?? "");
      setError(code.includes("failed-precondition")
        ? t("account.tooSlow")
        : t("account.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t("account.title")}</Text>
      <Text style={styles.body}>{t("account.removes")}</Text>
      <View style={styles.list}>
        {whatIsDeleted().map((line) => (
          <Text key={line} style={styles.item}>•  {line}</Text>
        ))}
      </View>
      <Muted>{t("account.friendsNotTold")}</Muted>
      <Text style={styles.label}>{t("account.typeToConfirm", { word: CONFIRM_WORD })}</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel={t("account.typeToConfirm", { word: CONFIRM_WORD })}
        style={styles.input}
      />
      <Muted>{t("account.signInAgain")}</Muted>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title={t("account.deleteButton")} kind="danger" busy={busy} disabled={!confirmed(typed) || busy} onPress={run} />
      <Button title={t("common.cancel")} kind="secondary" disabled={busy} onPress={() => router.back()} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 24, fontFamily: fonts.displayBold, color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  list: { gap: 6 },
  item: { fontSize: 16, lineHeight: 24, color: colors.text },
  label: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 17, letterSpacing: 2 },
}));
