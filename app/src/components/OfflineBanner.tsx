import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { t } from "../i18n";
import { useOffline } from "../lib/network";
import { makeStyles, Text, useColors } from "./ui";

/** "You're offline" note, shown only while the phone has no connection. */
export function OfflineBanner({ message }: { message?: string }) {
  const styles = useStyles();
  const colors = useColors();
  if (!useOffline()) return null;
  return (
    <View style={styles.root} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={20} color={colors.muted} />
      <Text style={styles.text}>{message ?? t("offline.banner")}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  text: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
}));
