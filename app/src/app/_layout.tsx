import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Centered } from "../components/ui";
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}
