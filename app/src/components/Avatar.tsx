import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { initials } from "../lib/profile";
import { useAvatar } from "../session/hooks";
import { fonts, makeStyles, Text } from "./ui";
import { t } from "../i18n";

/**
 * A round profile photo, or the person's initials while it loads or if they
 * haven't set one. `previewUri` shows a just-picked local photo before upload.
 */
export function Avatar({ path, name, size = 40, previewUri }: { path: string | null; name: string; size?: number; previewUri?: string | null }) {
  const styles = useStyles();
  const loaded = useAvatar(previewUri ? null : path);
  const uri = previewUri ?? loaded;
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.circle, round]} accessibilityLabel={t("profile.photoA11y", { name })}>
      {uri ? (
        // cachePolicy "none": the decoded photo stays in memory only.
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  circle: { backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: fonts.display, color: colors.accent },
}));
