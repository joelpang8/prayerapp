import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { t } from "../i18n";
import { loadSeenWhatsNew, markWhatsNewSeen, shouldShowWhatsNew, WHATS_NEW } from "../lib/whatsNew";
import { useReadySession } from "../session/SessionProvider";
import { Button, fonts, makeStyles, Text, useColors } from "./ui";

/** The "What's new" card on Today, once per update (lib/whatsNew.ts). */
export function WhatsNew() {
  const styles = useStyles();
  const colors = useColors();
  const { user } = useReadySession();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    const created = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
    loadSeenWhatsNew().then((seen) => {
      if (!live) return;
      if (shouldShowWhatsNew(seen, created)) setShow(true);
      else if (seen !== WHATS_NEW.id) void markWhatsNewSeen(); // a new account: nothing to announce
    });
    return () => { live = false; };
  }, [user]);
  if (!show) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
        <Text style={styles.title} accessibilityRole="header">{t("whatsNew.title")}</Text>
      </View>
      {WHATS_NEW.items.map((key) => (
        <View key={key} style={styles.item}>
          <Text style={styles.bullet} accessibilityElementsHidden importantForAccessibility="no">•</Text>
          <Text style={styles.itemText}>{t(key)}</Text>
        </View>
      ))}
      <Button title={t("whatsNew.gotIt")} kind="secondary" onPress={() => { setShow(false); void markWhatsNewSeen(); }} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.accentSoft, borderRadius: 16, padding: 16, gap: 8, marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  item: { flexDirection: "row", gap: 8 },
  bullet: { fontSize: 16, lineHeight: 22, color: colors.accent },
  itemText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
}));
