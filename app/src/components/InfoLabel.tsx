import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, View, type TextStyle } from "react-native";
import { t } from "../i18n";
import { fonts, makeStyles, Muted, Text, useColors } from "./ui";

/**
 * A label with a small ⓘ right after it. The explanation is folded away to
 * save space: tapping the ⓘ shows it underneath, and tapping again hides it.
 * VoiceOver reads the ⓘ as an expandable "About …" button.
 *  - `right`: a control on the same row (e.g. a Switch).
 *  - `section`: styled as a section title (like SectionTitle) instead of a row.
 *  - no `info`: just the label, without an ⓘ.
 */
export function InfoLabel({ label, info, right, section = false, style }: {
  label: string;
  info?: ReactNode;
  right?: ReactNode;
  section?: boolean;
  style?: TextStyle;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.root, section && styles.sectionRoot]}>
      <View style={[styles.row, !section && styles.optionRow]}>
        <View style={styles.labelWithIcon}>
          <Text style={[section ? styles.section : styles.label, style]}>{label}</Text>
          {info != null && (
            <Pressable
              onPress={() => setOpen(!open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={t("hint.about", { name: label })}
              hitSlop={12}
            >
              <Ionicons name={open ? "information-circle" : "information-circle-outline"} size={section ? 17 : 19} color={open ? colors.accent : colors.muted} />
            </Pressable>
          )}
        </View>
        {right}
      </View>
      {open && info != null && <Muted>{info}</Muted>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 4 },
  // Same spacing and type as SectionTitle in ui.tsx.
  sectionRoot: { marginTop: 24, marginBottom: 8 },
  section: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  optionRow: { minHeight: 44 },
  labelWithIcon: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  label: { fontSize: 16, color: colors.text, flexShrink: 1 },
}));
