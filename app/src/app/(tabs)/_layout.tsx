import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { navigationFonts, useColors } from "../../components/ui";
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
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: navigationFonts.headerTitleStyle,
        tabBarLabelStyle: navigationFonts.tabBarLabelStyle,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: tabIcon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: tabIcon("journal-outline", "journal") }} />
      <Tabs.Screen
        name="friends"
        options={{ title: "Friends", tabBarIcon: tabIcon("people-outline", "people"), tabBarBadge: graph.incoming.size || undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon("person-circle-outline", "person-circle") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: tabIcon("settings-outline", "settings") }} />
    </Tabs>
  );
}
