// Per-weight imports: the packages' main entry would bundle every weight
// (several MB each); these are all the app uses.
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_400Regular_Italic } from "@expo-google-fonts/figtree/400Regular_Italic";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces/400Regular";
import { Fraunces_400Regular_Italic } from "@expo-google-fonts/fraunces/400Regular_Italic";
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import type { ReactNode, Ref } from "react";
import { useTextScale } from "../lib/textSize";
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
  type TextStyle,
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
  /** The prayer-window candle: flame, its bright core, and the wax. Decorative only. */
  flame: "#E39B32",
  flameCore: "#FFE7A6",
  wax: "#F1EADF",
  /** Answered prayers: a quiet gold mark (text and borders) and its soft fill. */
  gold: "#8A5F0E",
  goldSoft: "#FBF3DF",
  /** Text on a photo (e.g. the date on a calendar thumbnail), over a soft dark wash. */
  scrim: "rgba(0,0,0,0.32)",
  onScrim: "#FFFFFF",
  /** Reading mode (the chapter screen): warmer paper and its hairlines. */
  paper: "#F4ECDD",
  paperRule: "#E2D6C2",
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
  flame: "#EDA548",
  flameCore: "#FFE3A0",
  wax: "#CDC2B1",
  gold: "#E2BE6A",
  goldSoft: "#2E2717",
  scrim: "rgba(0,0,0,0.4)",
  onScrim: "#FFFFFF",
  paper: "#1B1813",
  paperRule: "#3A342B",
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
 * Typefaces (SIL Open Font License; see docs/credits.md):
 *  - display:   Fraunces, for titles, names and verse references
 *  - scripture: Fraunces, for the Bible text. Its true italic renders the
 *               KJV's supplied words, as printed Bibles do.
 *  - body:      Figtree, for everything else: notes, buttons, labels and
 *               inputs (the default for Text and TextInput)
 * Custom fonts don't synthesize weights, so each weight is its own family:
 * use these names instead of fontWeight/fontStyle.
 */
export const fonts = {
  display: "Fraunces_500Medium",
  displayBold: "Fraunces_600SemiBold",
  scripture: "Fraunces_400Regular",
  scriptureItalic: "Fraunces_400Regular_Italic",
  body: "Figtree_400Regular",
  bodyItalic: "Figtree_400Regular_Italic",
  bodyMedium: "Figtree_500Medium",
  bodySemiBold: "Figtree_600SemiBold",
} as const;

/** Passed to useFonts() in the root layout. Keys must match `fonts`. */
export const fontAssets = {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Figtree_400Regular,
  Figtree_400Regular_Italic,
  Figtree_500Medium,
  Figtree_600SemiBold,
};

/**
 * Use these instead of React Native's Text and TextInput (lint enforces it),
 * so every piece of text is in the app's font unless a style says otherwise.
 */
/**
 * Applies the in-app Text size setting to a style: font size and line height
 * grow together. The phone's own larger-text setting applies on top, capped
 * (maxFontSizeMultiplier) so layouts stay usable.
 */
function scaled(base: TextStyle, style: TextProps["style"], scale: number) {
  if (scale === 1) return [base, style];
  const flat: TextStyle = StyleSheet.flatten([base, style]) ?? {};
  return [
    flat,
    {
      ...(typeof flat.fontSize === "number" ? { fontSize: flat.fontSize * scale } : { fontSize: 14 * scale }),
      ...(typeof flat.lineHeight === "number" ? { lineHeight: flat.lineHeight * scale } : {}),
    },
  ];
}

export function Text({ style, ...props }: TextProps) {
  const styles = useStyles();
  const scale = useTextScale();
  return <RNText maxFontSizeMultiplier={1.8} {...props} style={scaled(styles.text, style, scale)} />;
}

/**
 * Text nested inside a Text: inherits the parent's font, size and color
 * instead of resetting them, so only pass the styles that differ.
 */
export const Span = RNText;

/** `ref` reaches the native input (React 19 passes it as a prop), e.g. to focus it. */
export function TextInput({ style, ...props }: TextInputProps & { ref?: Ref<RNTextInput> }) {
  const styles = useStyles();
  const colors = useColors();
  const scale = useTextScale();
  return (
    <RNTextInput
      placeholderTextColor={colors.muted}
      keyboardAppearance={colors === dark ? "dark" : "light"}
      maxFontSizeMultiplier={1.8}
      {...props}
      style={scaled(styles.input, style, scale) as TextInputProps["style"]}
    />
  );
}

/** For navigation headers and the tab bar, which draw their own text. */
export const navigationFonts = {
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
  tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
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
  text: { fontFamily: fonts.body, color: colors.text },
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.text },
  buttonText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bodySemiBold },
  buttonLarge: { minHeight: 68, borderRadius: 16 },
  buttonTextLarge: { fontSize: 26, fontFamily: fonts.displayBold },
  section: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 24, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 15, marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
}));
