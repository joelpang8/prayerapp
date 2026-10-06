import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { ProfileView } from "../../components/ProfileView";
import { makeStyles } from "../../components/ui";
import { useReadySession } from "../../session/SessionProvider";
import { useProfiles } from "../../session/useProfiles";

/** Someone else's profile (or mine), opened by tapping a name or photo. */
export default function ProfileScreen() {
  const styles = useStyles();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { profile: me } = useReadySession();
  const others = useProfiles(uid === me.uid ? [] : [uid]);
  const name = uid === me.uid ? me.displayName : others.get(uid)?.displayName;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name ?? "" }} />
      <ProfileView uid={uid} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24 },
}));
