import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInForDevelopment, signInWithApple, signInWithGoogle, type SignInResult } from "../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput } from "../components/ui";
import { usingEmulators } from "../firebase";
import { setSuggestedDisplayName } from "../session/SessionProvider";

export default function SignInScreen() {
  const styles = useStyles();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<null | "apple" | "google" | "dev">(null);
  const [error, setError] = useState<string | null>(null);
  const [devName, setDevName] = useState("Tester");

  useEffect(() => {
    // Only offered once the Apple entitlement is built in (see app.config.ts).
    if (Platform.OS === "ios" && process.env.EXPO_PUBLIC_APPLE_SIGN_IN === "1") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable, () => {});
    }
  }, []);

  async function run(which: "apple" | "google" | "dev", fn: () => Promise<SignInResult>) {
    setBusy(which);
    setError(null);
    try {
      const result = await fn();
      if (result) setSuggestedDisplayName(result.suggestedName);
    } catch (err) {
      console.warn(err);
      setError(
        err instanceof Error && err.message.includes("isn't configured")
          ? "Google Sign-In isn't set up yet. In emulator mode, use Development sign-in below."
          : "Sign-in didn't work. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.title}>Pray now</Text>
        <Muted>Once a day, at a moment nobody expects, pause and pray. Share it with your friends.</Muted>
      </View>
      <View style={styles.actions}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={() => run("apple", signInWithApple)}
          />
        )}
        <Button title="Sign in with Google" kind="secondary" busy={busy === "google"} disabled={!!busy} onPress={() => run("google", signInWithGoogle)} />
        {usingEmulators && (
          <View style={styles.dev}>
            <Muted>Emulator mode: sign in as any test user.</Muted>
            <TextInput value={devName} onChangeText={setDevName} style={styles.input} autoCapitalize="words" />
            <Button title="Development sign-in" kind="secondary" busy={busy === "dev"} disabled={!!busy} onPress={() => run("dev", () => signInForDevelopment(devName))} />
          </View>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "space-between" },
  hero: { marginTop: 80, gap: 12 },
  title: { fontSize: 48, fontFamily: fonts.displayBold, color: colors.text },
  actions: { gap: 12, marginBottom: 24 },
  appleButton: { height: 48 },
  dev: { gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.card },
}));
