import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { Button, fonts, makeStyles, Muted, Text, TextInput, useColors } from "./ui";
import { t } from "../i18n";

export type SelectOption = { value: string; label: string };

/**
 * A dropdown: shows the current choice, opens a list to pick from, with
 * "None" to clear and (optionally) "Other…" to type your own.
 * A value that isn't in the list counts as "Other".
 */
export function SelectField({
  value,
  options,
  onChange,
  title,
  placeholder,
  otherMaxLength,
  otherPlaceholder,
  noneLabel = t("common.none"),
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Heading of the list, e.g. "Bible version". */
  title: string;
  placeholder: string;
  /** Set to allow "Other…" with this many characters at most. */
  otherMaxLength?: number;
  otherPlaceholder?: string;
  /** The first row, which clears the choice. */
  noneLabel?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const known = options.find((o) => o.value === value);
  const isOther = !!value && !known;
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState(isOther ? value : "");

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyping(false);
  };
  const show = () => {
    setTyping(isOther);
    setOther(isOther ? value : "");
    setOpen(true);
  };

  return (
    <>
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`${title}: ${known?.label ?? (value || t("select.notSet"))}`} style={styles.field}>
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {known?.label ?? (value || placeholder)}
        </Text>
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
          {typing ? (
            <View style={styles.otherBox}>
              <Muted>{t("select.notInList")}</Muted>
              <TextInput
                value={other}
                onChangeText={setOther}
                placeholder={otherPlaceholder}
                maxLength={otherMaxLength}
                autoFocus
                style={styles.input}
              />
              <Button title={t("select.useThis")} onPress={() => pick(other.trim())} disabled={!other.trim()} />
              <Button title={t("select.backToList")} kind="secondary" onPress={() => setTyping(false)} />
            </View>
          ) : (
            <FlatList
              data={[
                { value: "", label: noneLabel },
                ...options,
                ...(otherMaxLength ? [{ value: "\u0000other", label: isOther ? t("select.otherValue", { value }) : t("select.other") }] : []),
              ]}
              keyExtractor={(o) => o.value || "none"}
              renderItem={({ item }) => {
                const selected = item.value === "\u0000other" ? isOther : item.value === value;
                return (
                  <Pressable
                    onPress={() => (item.value === "\u0000other" ? setTyping(true) : pick(item.value))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={styles.row}
                  >
                    <Text style={[styles.rowText, !item.value && styles.placeholder]}>{item.label}</Text>
                    {selected && <Ionicons name="checkmark" size={22} color={colors.accent} />}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  field: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: { flex: 1, fontSize: 16, color: colors.text },
  placeholder: { color: colors.muted },
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 21, fontFamily: fonts.display, color: colors.text },
  done: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.accent },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { fontSize: 16, color: colors.text, flex: 1 },
  otherBox: { padding: 20, gap: 12 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card },
}));
