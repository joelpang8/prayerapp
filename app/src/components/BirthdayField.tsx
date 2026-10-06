import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { birthdayValue, daysInMonth, formatBirthday, monthName, parseBirthday } from "../lib/profile";
import { fonts, makeStyles, Muted, Text, useColors } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Birthday as a drop-down calendar: pick the month with the arrows, the year
 * from a list (or "Don't show year"), then tap the day.
 * value: "" | "MM-DD" | "YYYY-MM-DD".
 */
export function BirthdayField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const current = parseBirthday(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(current?.month ?? 1);
  const [year, setYear] = useState<number | null>(current?.year ?? null);
  const [choosingYear, setChoosingYear] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1900 + 1 }, (_, i) => thisYear - i);

  const show = () => {
    setMonth(current?.month ?? 1);
    setYear(current?.year ?? null);
    setChoosingYear(false);
    setOpen(true);
  };
  const pickDay = (day: number) => {
    const v = birthdayValue(month, day, year ?? undefined);
    if (v) {
      onChange(v);
      setOpen(false);
    }
  };

  // With a year, days line up under their weekdays; without one, they don't
  // belong to any particular week, so they're just listed.
  const days = daysInMonth(month, year ?? undefined);
  const lead = year ? new Date(year, month - 1, 1).getDay() : 0;
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <>
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`Birthday: ${value ? formatBirthday(value) : "not set"}`} style={styles.field}>
        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
        <Text style={[styles.value, !value && styles.placeholder]}>{value ? formatBirthday(value) : "Add your birthday"}</Text>
        <Ionicons name="chevron-down" size={20} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Birthday</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.controls}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => setMonth(month === 1 ? 12 : month - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month">
                <Ionicons name="chevron-back" size={26} color={colors.accent} />
              </Pressable>
              <Text style={styles.monthName}>{monthName(month)}</Text>
              <Pressable onPress={() => setMonth(month === 12 ? 1 : month + 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month">
                <Ionicons name="chevron-forward" size={26} color={colors.accent} />
              </Pressable>
            </View>
            <Pressable onPress={() => setChoosingYear(!choosingYear)} style={styles.yearButton} accessibilityRole="button">
              <Text style={styles.yearText}>{year ?? "Year (optional)"}</Text>
              <Ionicons name={choosingYear ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
            </Pressable>
          </View>

          {choosingYear ? (
            <FlatList
              data={[null, ...years]}
              keyExtractor={(y) => String(y)}
              initialNumToRender={30}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setYear(item); setChoosingYear(false); }}
                  style={styles.yearRow}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: item === year }}
                >
                  <Text style={[styles.yearRowText, item === null && styles.placeholder]}>{item ?? "Don't show year"}</Text>
                  {item === year && <Ionicons name="checkmark" size={22} color={colors.accent} />}
                </Pressable>
              )}
            />
          ) : (
            <View style={styles.grid}>
              {year !== null && (
                <View style={styles.week}>
                  {WEEKDAYS.map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}
                </View>
              )}
              {weeks.map((week, w) => (
                <View key={w} style={styles.week}>
                  {week.map((day, i) => {
                    if (!day) return <View key={i} style={styles.cell} />;
                    const selected = current?.month === month && current?.day === day && (current?.year ?? null) === year;
                    return (
                      <Pressable key={i} onPress={() => pickDay(day)} style={styles.cell} accessibilityRole="button" accessibilityLabel={`${monthName(month)} ${day}`}>
                        <View style={[styles.day, selected && styles.daySelected]}>
                          <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Muted>Tap a day. The year is optional: leave it out if you&apos;d rather not share your age.</Muted>
              {value !== "" && (
                <Pressable onPress={() => { onChange(""); setOpen(false); }} style={styles.remove} accessibilityRole="button">
                  <Text style={styles.removeText}>Remove birthday</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  field: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  value: { flex: 1, fontSize: 17, color: colors.text },
  placeholder: { color: colors.muted },
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  link: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
  controls: { padding: 20, gap: 12 },
  monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monthName: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  yearButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  yearText: { fontSize: 17, color: colors.text },
  yearRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  yearRowText: { fontSize: 17, color: colors.text },
  grid: { paddingHorizontal: 16, gap: 4 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted },
  cell: { flex: 1, alignItems: "center", minHeight: 46, justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.accent },
  dayText: { fontSize: 17, color: colors.text },
  dayTextSelected: { color: colors.onAccent },
  remove: { alignSelf: "center", paddingVertical: 16 },
  removeText: { fontSize: 16, color: colors.danger },
}));
