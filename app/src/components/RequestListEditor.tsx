import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { canAddRow, cleanRow, editorRows, joinRequests, MAX_REQUESTS, moveRow } from "../lib/prayerRequests";
import { fonts, makeStyles, Text, TextInput, useColors } from "./ui";
import { t } from "../i18n";

// Stable row keys, so removing a row doesn't move focus or text to another.
let lastKey = 0;
const newKey = () => ++lastKey;

/**
 * Prayer requests as a bullet list: one box per request, a remove button on
 * each, and "Add a request". Return in a box starts the next one. "Reorder"
 * switches to moving requests up and down (most important first: friends
 * see them in this order). Moving keeps each request's "praying" count, which
 * follows its words. Emits the stored form (one request per line); empty
 * rows are dropped when saving.
 * Mount it once the saved text has loaded: it keeps its own rows from then on.
 */
export function RequestListEditor({ initial, onChange, editable = true }: { initial: string; onChange: (text: string) => void; editable?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const [rows, setRows] = useState(() => editorRows(initial).map((text) => ({ key: newKey(), text })));
  const focusKey = useRef<number | null>(null);
  const [ordering, setOrdering] = useState(false);

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
  const filled = rows.filter((r) => r.text.trim());

  if (ordering) {
    return (
      <View style={styles.list}>
        <Text style={styles.orderNote}>{t("requests.orderNote")}</Text>
        {filled.map((r, i) => (
          <View key={r.key} style={styles.orderRow}>
            <Text style={styles.orderNumber}>{i + 1}</Text>
            <Text style={styles.orderText}>{r.text}</Text>
            <Pressable
              onPress={() => update(moveRow(filled, i, -1))}
              disabled={i === 0}
              accessibilityRole="button"
              accessibilityLabel={t("requests.moveUpA11y", { text: r.text })}
              hitSlop={6}
              style={[styles.move, i === 0 && styles.addOff]}
            >
              <Ionicons name="arrow-up-circle-outline" size={26} color={colors.accent} />
            </Pressable>
            <Pressable
              onPress={() => update(moveRow(filled, i, 1))}
              disabled={i === filled.length - 1}
              accessibilityRole="button"
              accessibilityLabel={t("requests.moveDownA11y", { text: r.text })}
              hitSlop={6}
              style={[styles.move, i === filled.length - 1 && styles.addOff]}
            >
              <Ionicons name="arrow-down-circle-outline" size={26} color={colors.accent} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setOrdering(false)} accessibilityRole="button" style={styles.add}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.accent} />
          <Text style={styles.addText}>{t("requests.doneOrdering")}</Text>
        </Pressable>
      </View>
    );
  }

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
            placeholder={i === 0 ? t("requests.firstPlaceholder") : t("requests.anotherPlaceholder")}
            accessibilityLabel={t("requests.rowA11y", { n: i + 1 })}
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
              accessibilityLabel={r.text ? t("requests.removeA11y", { text: r.text }) : t("requests.removeEmptyA11y")}
              hitSlop={8}
              style={styles.remove}
              disabled={!editable}
            >
              <Ionicons name="close-circle" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={styles.footer}>
        {rows.length < MAX_REQUESTS && (
          <Pressable onPress={() => add()} disabled={!canAdd} accessibilityRole="button" accessibilityState={{ disabled: !canAdd }} style={[styles.add, !canAdd && styles.addOff]}>
            <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
            <Text style={styles.addText}>{t("requests.add")}</Text>
          </Pressable>
        )}
        {editable && filled.length > 1 && (
          <Pressable onPress={() => { update(filled); setOrdering(true); }} accessibilityRole="button" style={styles.add}>
            <Ionicons name="swap-vertical-outline" size={22} color={colors.accent} />
            <Text style={styles.addText}>{t("requests.reorder")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  bullet: { fontSize: 22, color: colors.accent, width: 14, textAlign: "center" },
  input: {
    flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text,
  },
  remove: { minWidth: 32, minHeight: 44, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, paddingRight: 8 },
  addOff: { opacity: 0.45 },
  addText: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  footer: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  orderNote: { fontSize: 14, color: colors.muted },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingLeft: 12, paddingRight: 4, minHeight: 52, backgroundColor: colors.card },
  orderNumber: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.accent, width: 18 },
  orderText: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 8 },
  move: { minWidth: 40, minHeight: 44, alignItems: "center", justifyContent: "center" },
}));
