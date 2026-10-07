import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Centered, makeStyles, Muted } from "../../components/ui";
import { db } from "../../firebase";
import { findByUsername } from "../../lib/profile";

/** Where an invite link lands: finds the person and opens their profile. */
export default function InviteScreen() {
  const styles = useStyles();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    findByUsername(db, username ?? "").then(
      (p) => {
        if (!live) return;
        if (p) router.replace(`/profile/${p.uid}`);
        else setMissing(true);
      },
      () => { if (live) setMissing(true); },
    );
    return () => { live = false; };
  }, [username]);
  if (!missing) return <Centered />;
  return (
    <View style={styles.root}>
      <Muted>Nobody has the username @{username}. Ask your friend to send the invite again.</Muted>
      <Button title="Go to Friends" kind="secondary" onPress={() => router.replace("/friends")} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 16 },
}));
