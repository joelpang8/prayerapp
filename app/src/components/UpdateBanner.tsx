import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Application from "expo-application";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { db } from "../firebase";
import { t } from "../i18n";
import { TESTFLIGHT_URL, TESTFLIGHT_WEB, updateState, type UpdateState } from "../lib/appUpdate";
import { fonts, makeStyles, Text, useColors } from "./ui";

const DISMISSED_KEY = "updateBanner.dismissed";

/**
 * A slim one-line note on Today when a newer TestFlight build is ready.
 * Only in TestFlight/App Store builds (not ones installed from the Mac).
 * Tap to open TestFlight; ✕ hides it until the next new build. If this
 * build is too old to work with the server, it can't be hidden.
 */
export function UpdateBanner() {
  const styles = useStyles();
  const colors = useColors();
  const [state, setState] = useState<{ update: UpdateState; latest: number } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (Platform.OS !== "ios") return;
      const type = await Application.getIosApplicationReleaseTypeAsync().catch(() => null);
      if (type !== Application.ApplicationReleaseType.APP_STORE) return;
      const config = (await getDoc(doc(db, "config", "app"))).data();
      const update = updateState(Application.nativeBuildVersion, config);
      const latest = typeof config?.latestBuild === "number" ? config.latestBuild : 0;
      const dismissed = Number(await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null));
      if (live) {
        setState({ update, latest });
        setHidden(update === "available" && dismissed >= latest);
      }
    })().catch(() => {});
    return () => { live = false; };
  }, []);

  if (!state || state.update === "none" || hidden) return null;
  const required = state.update === "required";
  const open = () => { Linking.openURL(TESTFLIGHT_URL).catch(() => Linking.openURL(TESTFLIGHT_WEB).catch(() => {})); };
  return (
    <View style={[styles.root, required && styles.required]}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={required ? t("update.requiredA11y") : t("update.availableA11y")} style={styles.main} hitSlop={4}>
        <Ionicons name="arrow-up-circle" size={18} color={colors.accent} />
        <Text style={styles.text} numberOfLines={1}>{required ? t("update.required") : t("update.available")}</Text>
        <Text style={styles.link}>{t("update.action")}</Text>
      </Pressable>
      {!required && (
        <Pressable
          onPress={() => { setHidden(true); void AsyncStorage.setItem(DISMISSED_KEY, String(state.latest)).catch(() => {}); }}
          accessibilityRole="button"
          accessibilityLabel={t("update.dismiss")}
          hitSlop={10}
        >
          <Ionicons name="close" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accentSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  required: { borderWidth: 1, borderColor: colors.accent },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  text: { flex: 1, fontSize: 13.5, color: colors.text },
  link: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.accent },
}));
