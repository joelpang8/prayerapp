// Per-weight imports: the packages' main entry would bundle every weight
// (~10 MB); these five are all the app uses.
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond/700Bold";
import { EBGaramond_400Regular } from "@expo-google-fonts/eb-garamond/400Regular";
import { EBGaramond_400Regular_Italic } from "@expo-google-fonts/eb-garamond/400Regular_Italic";
import { EBGaramond_500Medium } from "@expo-google-fonts/eb-garamond/500Medium";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export const colors = {
  bg: "#FAF8F5",
  card: "#FFFFFF",
  text: "#1F1B16",
  muted: "#6B645C",
  border: "#E6E1DA",
  accent: "#5B4B8A",
  danger: "#B3261E",
};

/**
 * Typefaces (SIL Open Font License; see docs/credits.md):
 *  - display: Cormorant Garamond, for titles, names and verse references
 *  - serif:   EB Garamond, for scripture and prayer notes; its true italic
 *             renders the KJV's supplied words, as printed Bibles do
 * Buttons, labels and inputs stay in the system font for legibility.
 * Custom fonts don't synthesize weights, so each weight is its own family:
 * use these names instead of fontWeight/fontStyle.
 */
export const fonts = {
  display: "CormorantGaramond_600SemiBold",
  displayBold: "CormorantGaramond_700Bold",
  serif: "EBGaramond_400Regular",
  serifItalic: "EBGaramond_400Regular_Italic",
  serifMedium: "EBGaramond_500Medium",
} as const;

/** Passed to useFonts() in the root layout. Keys must match `fonts`. */
export const fontAssets = {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  EBGaramond_400Regular,
  EBGaramond_400Regular_Italic,
  EBGaramond_500Medium,
};

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && { backgroundColor: colors.accent },
        kind === "secondary" && styles.secondary,
        kind === "danger" && styles.secondary,
        (pressed || inactive) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? "#fff" : colors.accent} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            kind !== "primary" && { color: kind === "danger" ? colors.danger : colors.accent },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function Centered({ children }: { children?: ReactNode }) {
  return <View style={styles.centered}>{children ?? <ActivityIndicator color={colors.accent} />}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", marginTop: 24, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 15, marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
