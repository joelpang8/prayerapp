import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Centered, fontAssets, fonts, navigationFonts, palettes, useColors } from "../components/ui";
import { loadAppearance } from "../lib/appearance";
import { SessionProvider, useSession } from "../session/SessionProvider";

function RootNavigator() {
  const colors = useColors();
  const session = useSession();
  if (session.status === "loading") return <Centered />;
  // Pushed screens (profile, post) show a header with a back button.
  const pushed = {
    headerShown: true,
    headerBackTitle: "Back",
    headerStyle: { backgroundColor: colors.bg },
    headerTitleStyle: navigationFonts.headerTitleStyle,
    headerBackTitleStyle: { fontFamily: fonts.serif },
    headerShadowVisible: false,
  };
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={session.status === "signedOut"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={session.status === "needsProfile"}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={session.status === "ready"}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="compose" options={{ presentation: "modal" }} />
        <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
        <Stack.Screen name="profile/[uid]" options={pushed} />
        <Stack.Screen name="post/[id]" options={{ ...pushed, title: "Prayer" }} />
      </Stack.Protected>
    </Stack>
  );
}

/** Navigation's own colors (tab bar, headers, screen backgrounds) from the app's palette. */
function useNavigationTheme(): Theme {
  const colors = useColors();
  return useMemo(() => {
    const base = colors === palettes.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.bg,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors]);
}

export default function RootLayout() {
  // Fonts load from the app bundle in a moment. If loading ever fails, carry
  // on: text falls back to the system font rather than blocking the app.
  // The icon font loads with the text fonts, so tab icons don't pop in late.
  const [fontsLoaded, fontError] = useFonts({ ...fontAssets, ...Ionicons.font });
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  useEffect(() => { loadAppearance().finally(() => setAppearanceLoaded(true)); }, []);
  const theme = useNavigationTheme();
  if ((!fontsLoaded && !fontError) || !appearanceLoaded) return <Centered />;
  return (
    <ThemeProvider value={theme}>
      <SessionProvider>
        {/* "auto" follows the app's appearance, including a forced Light/Dark. */}
        <StatusBar style="auto" />
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
