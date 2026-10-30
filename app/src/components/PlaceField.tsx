import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { t } from "../i18n";
import { currentPlaceName, LocationUnavailableError, searchPlaceNames } from "../lib/location";
import { Button, fonts, makeStyles, Muted, Text, TextInput, useColors } from "./ui";

/**
 * "Where I'm from": tap to open a search. Type a town and pick one of the
 * places found, use where I am now, or keep exactly what I typed. Only the
 * name is kept (e.g. "Austin, Texas"), never a position.
 */
export function PlaceField({ value, onChange, maxLength, title, placeholder }: {
  value: string;
  onChange: (name: string) => void;
  maxLength: number;
  title: string;
  placeholder: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; names: string[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Search a moment after typing stops (the phone's place search is rate-limited).
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchPlaceNames(q).then((names) => { if (live) setResults({ query: q, names }); }, () => { if (live) setResults({ query: q, names: [] }); });
    }, 600);
    return () => { live = false; clearTimeout(timer); };
  }, [query, open]);

  const pick = (name: string) => {
    onChange(name.slice(0, maxLength));
    setOpen(false);
  };

  async function here() {
    setLocating(true);
    setProblem(null);
    try {
      pick(await currentPlaceName());
    } catch (err) {
      setProblem(err instanceof LocationUnavailableError && err.reason === "permission" ? t("compose.locationOff") : t("compose.locationFailed"));
    } finally {
      setLocating(false);
    }
  }

  const typed = query.trim();
  const searching = typed.length >= 2 && results?.query !== typed;
  const found = results?.query === typed ? results.names : [];
  return (
    <>
      <Pressable
        onPress={() => { setQuery(""); setResults(null); setProblem(null); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${value || t("select.notSet")}`}
        style={styles.field}
      >
        <Ionicons name="location-outline" size={18} color={colors.muted} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={20} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>{t("select.close")}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("place.searchPlaceholder")}
              autoFocus
              autoCorrect={false}
              maxLength={maxLength}
              returnKeyType="search"
              style={styles.input}
              accessibilityLabel={t("place.searchPlaceholder")}
            />
            <Pressable onPress={here} disabled={locating} accessibilityRole="button" style={styles.row}>
              <Ionicons name="navigate-outline" size={20} color={colors.accent} />
              <Text style={styles.rowAccent}>{t("place.useHere")}</Text>
              {locating && <ActivityIndicator color={colors.accent} />}
            </Pressable>
            {problem && <Muted>{problem}</Muted>}
            {searching && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
            {found.map((name) => (
              <Pressable key={name} onPress={() => pick(name)} accessibilityRole="button" style={styles.row}>
                <Ionicons name="location-outline" size={20} color={colors.muted} />
                <Text style={styles.rowText}>{name}</Text>
              </Pressable>
            ))}
            {!searching && typed.length >= 2 && found.length === 0 && <Muted>{t("place.nothingFound")}</Muted>}
            {typed !== "" && !found.some((n) => n.toLowerCase() === typed.toLowerCase()) && (
              <Pressable onPress={() => pick(typed)} accessibilityRole="button" style={styles.row}>
                <Ionicons name="create-outline" size={20} color={colors.muted} />
                <Text style={styles.rowText}>{t("place.useTyped", { text: typed })}</Text>
              </Pressable>
            )}
            <Muted>{t("place.note")}</Muted>
            {value !== "" && <Button title={t("place.clear")} kind="secondary" onPress={() => pick("")} />}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  field: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  value: { flex: 1, fontSize: 16, color: colors.text },
  placeholder: { color: colors.muted },
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 21, fontFamily: fonts.display, color: colors.text },
  done: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  body: { padding: 20, gap: 10 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  rowAccent: { flex: 1, fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  spinner: { marginVertical: 8 },
}));
