import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, type ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { ActivityBell } from "../../components/ActivityBell";
import { navigationFonts, useColors } from "../../components/ui";
import { useNotificationTaps } from "../../lib/notifications";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph } from "../../session/SessionProvider";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Outline when idle, filled when selected (the usual iOS convention). */
function tabIcon(name: IconName, selectedName: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? selectedName : name} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  const colors = useColors();
  const { graph } = useFriendGraph();
  const blocked = useBlocked();
  const requests = [...graph.incoming].filter((uid) => !blocked.has(uid)).length;
  // Tapping a "Time to pray" notification opens Today. (These tabs only
  // exist once signed in, so a tap while signed out just opens sign-in.)
  useNotificationTaps(useCallback(() => router.navigate("/"), []));
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: navigationFonts.headerTitleStyle,
        tabBarLabelStyle: navigationFonts.tabBarLabelStyle,
      }}
    >
      {/* Today sits in the middle, the app's main place. */}
      <Tabs.Screen
        name="friends"
        options={{ title: "Friends", tabBarIcon: tabIcon("people-outline", "people"), tabBarBadge: requests || undefined }}
      />
      <Tabs.Screen name="prayers" options={{ title: "Prayers", tabBarIcon: tabIcon("journal-outline", "journal") }} />
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: tabIcon("sunny-outline", "sunny"), headerRight: () => <ActivityBell /> }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon("person-circle-outline", "person-circle") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("settings-outline", "settings") }} />
    </Tabs>
  );
}
