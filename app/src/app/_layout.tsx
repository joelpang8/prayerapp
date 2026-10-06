import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Centered, colors, fontAssets } from "../components/ui";
import { SessionProvider, useSession } from "../session/SessionProvider";

function RootNavigator() {
  const session = useSession();
  if (session.status === "loading") return <Centered />;
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
        <Stack.Screen
          name="profile/[uid]"
          options={{ headerShown: true, headerBackTitle: "Back", headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Fonts load from the app bundle in a moment. If loading ever fails, carry
  // on: text falls back to the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  if (!fontsLoaded && !fontError) return <Centered />;
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}
