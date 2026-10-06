import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import { formatReference, parseRefId } from "../lib/scripture/reference";
import { fonts, makeStyles, Text } from "./ui";
import { VerseBlock } from "./VerseBlock";

// A display preference only (no one's content), so it's fine to keep on disk.
const COLLAPSED_KEY = "ui.wordOfTheDay.collapsed";

function displayRef(refId: string): string {
  try {
    return formatReference(parseRefId(refId));
  } catch {
    return refId;
  }
}

/**
 * Today's verse under a "Word of the day" heading. Tap the heading to
 * collapse it to just the reference, or expand it again; the choice is
 * remembered on this device.
 */
export function WordOfTheDay({ refId }: { refId: string }) {
  const styles = useStyles();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_KEY).then(
      (v) => setCollapsed(v === "1"),
      () => {},
    );
  }, []);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !collapsed;
    setCollapsed(next);
    AsyncStorage.setItem(COLLAPSED_KEY, next ? "1" : "0").catch(() => {});
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Word of the day, ${displayRef(refId)}`}
        accessibilityState={{ expanded: !collapsed }}
        accessibilityHint={collapsed ? "Shows the verse" : "Hides the verse"}
        hitSlop={8}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.label}>Word of the day</Text>
          {collapsed && <Text style={styles.reference}>{displayRef(refId)}</Text>}
        </View>
        <Text style={[styles.chevron, { transform: [{ rotate: collapsed ? "90deg" : "-90deg" }] }]}>›</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.body}>
          <VerseBlock refId={refId} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontFamily: fonts.serifSemiBold, color: colors.accent, textTransform: "uppercase", letterSpacing: 0.8 },
  reference: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  chevron: { fontSize: 26, color: colors.muted, width: 24, textAlign: "center" },
  body: { marginTop: 12 },
}));
