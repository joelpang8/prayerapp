import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { useColors } from "./ui";
import { t } from "../i18n";

/** The gear in Profile's header: opens Settings (no longer a tab, so Today sits in the middle). */
export function SettingsGear() {
  const colors = useColors();
  return (
    <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel={t("tabs.settings")} hitSlop={10} style={{ marginRight: 16, padding: 2 }}>
      <Ionicons name="settings-outline" size={24} color={colors.accent} />
    </Pressable>
  );
}
