import { Tabs } from "expo-router/js-tabs";
import { colors } from "../../components/ui";
import { useFriendGraph } from "../../session/SessionProvider";

export default function TabsLayout() {
  const { graph } = useFriendGraph();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen
        name="friends"
        options={{ title: "Friends", tabBarBadge: graph.incoming.size || undefined }}
      />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
