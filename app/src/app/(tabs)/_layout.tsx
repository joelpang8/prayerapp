import { Tabs } from "expo-router/js-tabs";
import { navigationFonts, useColors } from "../../components/ui";
import { useFriendGraph } from "../../session/SessionProvider";

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
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen
        name="friends"
        options={{ title: "Friends", tabBarBadge: graph.incoming.size || undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
