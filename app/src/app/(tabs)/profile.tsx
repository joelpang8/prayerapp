import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { ProfileView } from "../../components/ProfileView";
import { Button, makeStyles } from "../../components/ui";
import { shareInvite } from "../../lib/invite";
import { useReadySession } from "../../session/SessionProvider";
import { t } from "../../i18n";

/** My own profile, as friends see it, with a way to edit it. */
export default function MyProfileScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ProfileView
        uid={profile.uid}
        actions={
          <View style={styles.actions}>
            <Button title={t("profile.edit")} kind="secondary" onPress={() => router.push("/edit-profile")} />
            <Button title={t("profile.invite")} onPress={() => shareInvite(profile.username).catch(() => {})} />
          </View>
        }
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24 },
  actions: { alignSelf: "stretch", gap: 10 },
}));
