import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { canAddRow, cleanRow, editorRows, joinRequests, MAX_REQUESTS } from "../lib/prayerRequests";
import { fonts, makeStyles, Text, TextInput, useColors } from "./ui";

// Stable row keys, so removing a row doesn't move focus or text to another.
let lastKey = 0;
const newKey = () => ++lastKey;

/**
 * Prayer requests as a bullet list: one box per request, a remove button on
 * each, and "Add a request". Return in a box starts the next one. Emits the
 * stored form (one request per line); empty rows are dropped when saving.
 * Mount it once the saved text has loaded: it keeps its own rows from then on.
 */
export function RequestListEditor({ initial, onChange, editable = true }: { initial: string; onChange: (text: string) => void; editable?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const [rows, setRows] = useState(() => editorRows(initial).map((text) => ({ key: newKey(), text })));
  const focusKey = useRef<number | null>(null);

  function update(next: { key: number; text: string }[]) {
    setRows(next);
    onChange(joinRequests(next.map((r) => r.text)));
  }

  function add(after = rows.length - 1) {
    if (!canAddRow(rows.map((r) => r.text))) return;
    const key = newKey();
    focusKey.current = key;
    update([...rows.slice(0, after + 1), { key, text: "" }, ...rows.slice(after + 1)]);
  }

  function remove(i: number) {
    const next = rows.filter((_, j) => j !== i);
    update(next.length > 0 ? next : [{ key: newKey(), text: "" }]);
  }

  const canAdd = editable && canAddRow(rows.map((r) => r.text));
  return (
    <View style={styles.list}>
      {rows.map((r, i) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.bullet} importantForAccessibility="no" accessibilityElementsHidden>•</Text>
          <TextInput
            ref={(el) => {
              if (el && focusKey.current === r.key) {
                focusKey.current = null;
                el.focus();
              }
            }}
            value={r.text}
            onChangeText={(t) => update(rows.map((x) => (x.key === r.key ? { ...x, text: cleanRow(t) } : x)))}
            placeholder={i === 0 ? "e.g. My mum's health" : "Another request"}
            accessibilityLabel={`Prayer request ${i + 1}`}
            returnKeyType={canAddRow(rows.map((x) => x.text)) ? "next" : "done"}
            submitBehavior={canAddRow(rows.map((x) => x.text)) ? "submit" : "blurAndSubmit"}
            onSubmitEditing={() => add(i)}
            style={styles.input}
            editable={editable}
          />
          {(rows.length > 1 || r.text !== "") && (
            <Pressable
              onPress={() => remove(i)}
              accessibilityRole="button"
              accessibilityLabel={r.text ? `Remove request: ${r.text}` : "Remove this empty request"}
              hitSlop={8}
              style={styles.remove}
              disabled={!editable}
            >
              <Ionicons name="close-circle" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      {rows.length < MAX_REQUESTS && (
        <Pressable onPress={() => add()} disabled={!canAdd} accessibilityRole="button" accessibilityState={{ disabled: !canAdd }} style={[styles.add, !canAdd && styles.addOff]}>
          <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
          <Text style={styles.addText}>Add a request</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  bullet: { fontSize: 22, color: colors.accent, width: 14, textAlign: "center" },
  input: {
    flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, color: colors.text,
  },
  remove: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, paddingRight: 8 },
  addOff: { opacity: 0.45 },
  addText: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
}));
