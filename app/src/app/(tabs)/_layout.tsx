import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, type ComponentProps } from "react";
import { View, type ColorValue } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { ActivityBell } from "../../components/ActivityBell";
import { navigationFonts, useColors } from "../../components/ui";
import { useNotificationPermission, useNotificationsEnabled, useNotificationTaps } from "../../lib/notifications";
import { usePromptSubscription, usePushTaps } from "../../lib/push";
import { useBlocked } from "../../session/hooks";
import { useFriendGraph } from "../../session/SessionProvider";
import { useLiveActivity } from "../../session/useLiveActivity";
import { t } from "../../i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Outline when idle, filled when selected (the usual iOS convention). */
function tabIcon(name: IconName, selectedName: IconName) {
  return function TabIcon({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) {
    return <Ionicons name={focused ? selectedName : name} color={color} size={size} />;
  };
}

/**
 * Today, the app's main place, sits in a raised circle in the middle of the
 * tab bar: filled when it's open, a soft ring otherwise.
 */
function TodayIcon({ focused }: { focused: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: 54,
        height: 54,
        borderRadius: 27,
        marginTop: -18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? colors.accent : colors.accentSoft,
        borderWidth: 3,
        borderColor: colors.bg,
      }}
    >
      <Ionicons name={focused ? "sunny" : "sunny-outline"} size={28} color={focused ? colors.onAccent : colors.accent} />
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const { graph } = useFriendGraph();
  const blocked = useBlocked();
  const requests = [...graph.incoming].filter((uid) => !blocked.has(uid)).length;
  // Tapping a "Time to pray" notification opens Today. (These tabs only
  // exist once signed in, so a tap while signed out just opens sign-in.)
  const openToday = useCallback(() => router.navigate("/"), []);
  useNotificationTaps(openToday);
  usePushTaps(openToday);
  // The lock-screen countdown while the prompt is open (iPhone only).
  useLiveActivity();
  // Push builds: this phone gets the daily "Time to pray" push only while the
  // app's notifications switch is on and the phone allows notifications.
  const permission = useNotificationPermission();
  const notificationsOn = useNotificationsEnabled();
  usePromptSubscription(permission.status === null ? null : notificationsOn && permission.status === "granted");
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
        options={{ title: t("tabs.friends"), tabBarIcon: tabIcon("people-outline", "people"), tabBarBadge: requests || undefined }}
      />
      <Tabs.Screen name="prayers" options={{ title: t("tabs.prayers"), tabBarIcon: tabIcon("journal-outline", "journal") }} />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ focused }) => <TodayIcon focused={focused} />,
          tabBarAccessibilityLabel: t("tabs.today"),
          headerRight: () => <ActivityBell />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile"), tabBarIcon: tabIcon("person-circle-outline", "person-circle") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings"), tabBarIcon: tabIcon("settings-outline", "settings") }} />
    </Tabs>
  );
}
