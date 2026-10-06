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
  useColorScheme,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";

/** Day: warm paper. */
const light = {
  bg: "#FAF8F5",
  card: "#FFFFFF",
  text: "#1F1B16",
  muted: "#6B645C",
  border: "#E6E1DA",
  accent: "#5B4B8A",
  /** Text and spinners on an accent background. */
  onAccent: "#FFFFFF",
  /** Quiet accent fill, e.g. behind initials. */
  accentSoft: "#ECE7F3",
  danger: "#B3261E",
  /** Text on a danger background (e.g. the Activity badge). */
  onDanger: "#FFFFFF",
};

/** Night: warm dark brown rather than pure black, with a lighter accent for contrast. */
const dark: typeof light = {
  bg: "#15130F",
  card: "#1F1C17",
  text: "#EEE7DB",
  muted: "#A69D90",
  border: "#38332C",
  accent: "#B9AAE6",
  onAccent: "#1B1530",
  accentSoft: "#2D2742",
  danger: "#F2B8B5",
  onDanger: "#3A0D0B",
};

export type Colors = typeof light;
export const palettes = { light, dark } as const;

/**
 * The palette for the current appearance. Follows the setting in
 * lib/appearance.ts (System, Light or Dark), which drives useColorScheme().
 */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/**
 * Like StyleSheet.create, but built for both palettes; the returned hook
 * picks the one for the current appearance. Use in place of StyleSheet.create
 * for anything with a color in it:
 *   const useStyles = makeStyles((colors) => ({ root: { backgroundColor: colors.bg } }));
 *   ...inside the component: const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (colors: Colors) => T): () => T {
  const sheets = { light: StyleSheet.create(build(light)), dark: StyleSheet.create(build(dark)) };
  return function useStyles() {
    return useColorScheme() === "dark" ? sheets.dark : sheets.light;
  };
}

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
  const styles = useStyles();
  return <RNText {...props} style={[styles.text, style]} />;
}

/**
 * Text nested inside a Text: inherits the parent's font, size and color
 * instead of resetting them, so only pass the styles that differ.
 */
export const Span = RNText;

export function TextInput({ style, ...props }: TextInputProps) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <RNTextInput
      placeholderTextColor={colors.muted}
      keyboardAppearance={colors === dark ? "dark" : "light"}
      {...props}
      style={[styles.input, style]}
    />
  );
}

/** For navigation headers and the tab bar, which draw their own text. */
export const navigationFonts = {
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
  tabBarLabelStyle: { fontFamily: fonts.serifMedium, fontSize: 12 },
};

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const styles = useStyles();
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  busy,
  size = "normal",
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  /** "large": the one main action on a screen, e.g. Pray now. */
  size?: "normal" | "large";
}) {
  const styles = useStyles();
  const colors = useColors();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === "large" && styles.buttonLarge,
        kind === "primary" && { backgroundColor: colors.accent },
        kind === "secondary" && styles.secondary,
        kind === "danger" && styles.secondary,
        (pressed || inactive) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? colors.onAccent : colors.accent} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            size === "large" && styles.buttonTextLarge,
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
  const styles = useStyles();
  return <Text style={styles.section}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.error}>{children}</Text>;
}

export function Centered({ children }: { children?: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return <View style={styles.centered}>{children ?? <ActivityIndicator color={colors.accent} />}</View>;
}

const useStyles = makeStyles((colors) => ({
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
  buttonText: { color: colors.onAccent, fontSize: 17, fontFamily: fonts.serifSemiBold },
  buttonLarge: { minHeight: 68, borderRadius: 16 },
  buttonTextLarge: { fontSize: 30, fontFamily: fonts.displayBold, letterSpacing: 0.5 },
  section: { fontSize: 14, fontFamily: fonts.serifSemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 24, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 16, marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
}));
