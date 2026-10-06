import { router } from "expo-router";
import { ScrollView } from "react-native";
import { ProfileView } from "../../components/ProfileView";
import { Button, makeStyles } from "../../components/ui";
import { useReadySession } from "../../session/SessionProvider";

/** My own profile, as friends see it, with a way to edit it. */
export default function MyProfileScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ProfileView uid={profile.uid} actions={<Button title="Edit profile" kind="secondary" onPress={() => router.push("/edit-profile")} />} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24 },
}));
