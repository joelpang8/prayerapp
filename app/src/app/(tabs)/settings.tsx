import { StyleSheet, Text, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, colors, Muted, Screen } from "../../components/ui";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  const { profile } = useReadySession();
  return (
    <Screen style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile.displayName}</Text>
        <Muted>@{profile.username}</Muted>
      </View>
      <Button title="Sign out" kind="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 4 },
  name: { fontSize: 18, fontWeight: "600", color: colors.text },
});
