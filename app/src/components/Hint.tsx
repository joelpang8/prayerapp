import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { t } from "../i18n";
import { fonts, makeStyles, Muted, Text, useColors } from "./ui";

/**
 * A setting's explanation, folded away to save space: a small "ⓘ About this"
 * that opens the text, and tapping again hides it. VoiceOver reads it as an
 * expandable button.
 */
export function Hint({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t("hint.hide") : t("hint.show")}
        hitSlop={8}
        style={styles.toggle}
      >
        <Ionicons name={open ? "information-circle" : "information-circle-outline"} size={18} color={colors.muted} />
        <Text style={styles.toggleText}>{open ? t("hint.hide") : t("hint.show")}</Text>
      </Pressable>
      {open && <Muted>{children}</Muted>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  toggleText: { fontSize: 15, color: colors.muted, fontFamily: fonts.bodyMedium },
}));
