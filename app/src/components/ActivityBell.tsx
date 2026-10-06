import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useActivity } from "../session/hooks";
import { fonts, makeStyles, Text, useColors } from "./ui";

/** The bell in Today's header: opens Activity, with a count of what's new. */
export function ActivityBell() {
  const styles = useStyles();
  const colors = useColors();
  const { unseen } = useActivity();
  return (
    <Pressable
      onPress={() => router.push("/activity")}
      accessibilityRole="button"
      accessibilityLabel={unseen ? `Activity, ${unseen} new` : "Activity"}
      hitSlop={10}
      style={styles.root}
    >
      <Ionicons name={unseen ? "notifications" : "notifications-outline"} size={24} color={colors.accent} />
      {unseen > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unseen > 9 ? "9+" : unseen}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { marginRight: 16, padding: 2 },
  badge: { position: "absolute", top: -4, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { fontSize: 11, fontFamily: fonts.serifSemiBold, color: colors.onDanger },
}));
