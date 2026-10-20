import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSavedVerses } from "../session/hooks";
import { fonts, makeStyles, Muted, Text, useColors } from "./ui";
import { VerseBlock } from "./VerseBlock";

const FIRST = 3;

/**
 * "Saved verses" on the Prayers tab: the verses I've saved, newest first,
 * each to read again (Read more), listen to, or remove (Saved). Closed until
 * tapped, so it doesn't push the calendar down. Only mine; nobody else sees it.
 */
export function SavedVerses() {
  const styles = useStyles();
  const colors = useColors();
  const { verses, loaded } = useSavedVerses();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (!loaded) return null;
  const shown = all ? verses : verses.slice(0, FIRST);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Saved verses, ${verses.length}`}
        hitSlop={8}
        style={styles.header}
      >
        <Ionicons name="bookmark" size={20} color={colors.accent} />
        <Text style={styles.title} accessibilityRole="header">Saved verses</Text>
        {verses.length > 0 && <Text style={styles.count}>{verses.length}</Text>}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
      </Pressable>
      {open && (
        verses.length === 0 ? (
          <Muted>Tap Save under any verse to keep it here, to read or listen to again. Only you see this list.</Muted>
        ) : (
          <View style={styles.list}>
            {shown.map((v) => (
              <View key={v.refId} style={styles.item}>
                <VerseBlock refId={v.refId} />
              </View>
            ))}
            {verses.length > FIRST && !all && (
              <Pressable onPress={() => setAll(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.more}>Show all {verses.length}</Text>
              </Pressable>
            )}
            <Muted>Only you see this list. Tap Saved to remove a verse.</Muted>
          </View>
        )
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.display, color: colors.text },
  count: { fontSize: 16, fontFamily: fonts.serifSemiBold, color: colors.muted },
  list: { gap: 18 },
  item: { gap: 4 },
  more: { fontSize: 16, color: colors.accent, fontFamily: fonts.serifSemiBold },
}));
