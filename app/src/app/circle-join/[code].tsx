import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { CirclePhoto } from "../../components/CirclePhoto";
import { Button, fonts, makeStyles, Muted, Text } from "../../components/ui";
import { db } from "../../firebase";
import { t } from "../../i18n";
import { askToJoin, cancelAskToJoin, haveAskedToJoin, readLinkCard, type LinkCard } from "../../lib/circles";
import { useReadySession } from "../../session/SessionProvider";
import { useMyCircles } from "../../session/useCircles";

/**
 * Opened from a circle's invite link (prayerapp://circle-join/{code}):
 * shows the circle's name and "Ask to join". The leader decides; nothing
 * of the circle is visible until they approve.
 */
export default function CircleJoinScreen() {
  const styles = useStyles();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { profile: me } = useReadySession();
  const { circles } = useMyCircles();
  const [card, setCard] = useState<LinkCard | null | undefined>(undefined);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void readLinkCard(db, code).then(async (c) => {
      if (!live) return;
      setCard(c);
      if (c) setAsked(await haveAskedToJoin(db, c.circleId, me.uid));
    });
    return () => { live = false; };
  }, [code, me.uid]);

  const member = !!card && circles.some((c) => c.id === card.circleId);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.warn("circle join failed", err);
      Alert.alert(t("circles.didntWork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t("circleJoin.title") }} />
      {card === null && <Muted>{t("circleJoin.invalid")}</Muted>}
      {card && (
        <View style={styles.card}>
          <CirclePhoto path={null} size={72} />
          <Text style={styles.name}>{card.name}</Text>
          {member ? (
            <>
              <Muted>{t("circleJoin.alreadyIn")}</Muted>
              <Button title={t("circleJoin.open")} onPress={() => router.replace({ pathname: "/circle/[id]", params: { id: card.circleId } })} />
            </>
          ) : asked ? (
            <>
              <Muted>{t("circleJoin.sent")}</Muted>
              <Button title={t("circleJoin.cancel")} kind="secondary" busy={busy} onPress={() => run(async () => { await cancelAskToJoin(db, card.circleId, me.uid); setAsked(false); })} />
            </>
          ) : (
            <>
              <Muted>{t("circleJoin.askNote")}</Muted>
              <Button title={t("circleJoin.ask")} size="large" busy={busy} onPress={() => run(async () => { await askToJoin(db, card, me.uid); setAsked(true); })} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 14, alignItems: "center" },
  name: { fontSize: 24, fontFamily: fonts.displayBold, color: colors.text, textAlign: "center" },
}));
