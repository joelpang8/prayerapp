// Per-weight imports: the packages' main entry would bundle every weight
// (~10 MB); these five are all the app uses.
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond/700Bold";
import { EBGaramond_400Regular } from "@expo-google-fonts/eb-garamond/400Regular";
import { EBGaramond_400Regular_Italic } from "@expo-google-fonts/eb-garamond/400Regular_Italic";
import { EBGaramond_500Medium } from "@expo-google-fonts/eb-garamond/500Medium";
import { EBGaramond_600SemiBold } from "@expo-google-fonts/eb-garamond/600SemiBold";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";

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
 * Typefaces (SIL Open Font License; see docs/credits.md), used for all text:
 *  - display: Cormorant Garamond, for titles, names and verse references
 *  - serif:   EB Garamond, for everything else: scripture, notes, buttons,
 *             labels and inputs. Its true italic renders the KJV's supplied
 *             words, as printed Bibles do.
 * Custom fonts don't synthesize weights, so each weight is its own family:
 * use these names instead of fontWeight/fontStyle.
 */
export const fonts = {
  display: "CormorantGaramond_600SemiBold",
  displayBold: "CormorantGaramond_700Bold",
  serif: "EBGaramond_400Regular",
  serifItalic: "EBGaramond_400Regular_Italic",
  serifMedium: "EBGaramond_500Medium",
  serifSemiBold: "EBGaramond_600SemiBold",
} as const;

/** Passed to useFonts() in the root layout. Keys must match `fonts`. */
export const fontAssets = {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  EBGaramond_400Regular,
  EBGaramond_400Regular_Italic,
  EBGaramond_500Medium,
  EBGaramond_600SemiBold,
};

/**
 * Use these instead of React Native's Text and TextInput (lint enforces it),
 * so every piece of text is in the app's font unless a style says otherwise.
 */
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.text, style]} />;
}

/**
 * Text nested inside a Text: inherits the parent's font, size and color
 * instead of resetting them, so only pass the styles that differ.
 */
export const Span = RNText;

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, style]} />;
}

/** For navigation headers and the tab bar, which draw their own text. */
export const navigationFonts = {
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  tabBarLabelStyle: { fontFamily: fonts.serifMedium, fontSize: 12 },
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
  text: { fontFamily: fonts.serif, color: colors.text },
  input: { fontFamily: fonts.serif, fontSize: 17, color: colors.text },
  buttonText: { color: "#fff", fontSize: 17, fontFamily: fonts.serifSemiBold },
  section: { fontSize: 14, fontFamily: fonts.serifSemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 24, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 16, marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
