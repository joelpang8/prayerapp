import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { t } from "../i18n";
import { groupSavedVerses } from "../lib/savedVerses";
import { bookName } from "../lib/scripture/reference";
import { useSavedVerses } from "../session/hooks";
import { fonts, makeStyles, Muted, Text, useColors } from "./ui";
import { VerseBlock } from "./VerseBlock";

/**
 * "Saved verses" on the Prayers tab, organized by book of the Bible (in
 * Bible order, each book's verses in order), with how many in each. Tap a
 * book to open its verses, each to read again (Read more), listen to, or
 * remove (Saved). Closed until tapped, so it doesn't push the calendar
 * down. Only mine; nobody else sees it.
 */
export function SavedVerses() {
  const styles = useStyles();
  const colors = useColors();
  const { verses, loaded } = useSavedVerses();
  const [open, setOpen] = useState(false);
  const [openBook, setOpenBook] = useState<string | null>(null);
  if (!loaded) return null;
  const books = groupSavedVerses(verses);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t("prayers.saved.a11y", { count: verses.length })}
        hitSlop={8}
        style={styles.header}
      >
        <Ionicons name="bookmark" size={20} color={colors.accent} />
        <Text style={styles.title} accessibilityRole="header">{t("prayers.saved.title")}</Text>
        {verses.length > 0 && <Text style={styles.count}>{verses.length}</Text>}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
      </Pressable>
      {open && (
        verses.length === 0 ? (
          <Muted>{t("prayers.saved.empty")}</Muted>
        ) : (
          <View>
            {books.map(({ book, refIds }) => {
              const expanded = openBook === book;
              const name = bookName(book);
              return (
                <View key={book} style={styles.book}>
                  <Pressable
                    onPress={() => setOpenBook(expanded ? null : book)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={t("prayers.saved.bookA11y", { book: name, count: refIds.length })}
                    style={styles.bookRow}
                  >
                    <Text style={styles.bookName}>{name}</Text>
                    <Text style={styles.bookCount}>{refIds.length}</Text>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} size={18} color={colors.muted} />
                  </Pressable>
                  {expanded && (
                    <View style={styles.list}>
                      {refIds.map((refId) => <VerseBlock key={refId} refId={refId} />)}
                    </View>
                  )}
                </View>
              );
            })}
            <Muted>{t("prayers.saved.footer")}</Muted>
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
  book: { borderTopWidth: 1, borderTopColor: colors.border },
  bookRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  bookName: { flex: 1, fontSize: 19, fontFamily: fonts.display, color: colors.text },
  bookCount: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.muted },
  list: { gap: 18, paddingBottom: 14 },
}));
