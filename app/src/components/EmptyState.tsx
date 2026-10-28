import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { fonts, makeStyles, Text, useColors } from "./ui";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * A gentle "nothing here yet": a small line drawing, a short title and a
 * kind sentence. Never "you missed" or anything that sounds like a score.
 * VoiceOver reads the title and sentence; the drawing is decorative.
 */
export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.root} accessible accessibilityLabel={message ? `${title}. ${message}` : title}>
      <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Ionicons name={icon} size={34} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 16, gap: 8 },
  art: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 19, fontFamily: fonts.display, color: colors.text, textAlign: "center" },
  message: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: "center", maxWidth: 340 },
}));
