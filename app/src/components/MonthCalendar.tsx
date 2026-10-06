import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { dayKey, monthGrid, monthTitle, type YearMonth } from "../lib/calendar";
import { fonts, makeStyles, Text, useColors } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A month of days. Days with a prayer get a dot (filled ring if it was
 * answered) and can be tapped; the rest are plain.
 */
export function MonthCalendar({
  month,
  marked,
  selected,
  onSelect,
  onChangeMonth,
  canGoForward,
}: {
  month: YearMonth;
  /** dayKey -> whether a prayer that day was answered. */
  marked: ReadonlyMap<string, boolean>;
  selected: string | null;
  onSelect: (day: string) => void;
  onChangeMonth: (delta: number) => void;
  canGoForward: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  const today = dayKey(new Date());
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => onChangeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.title}>{monthTitle(month)}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={12}
          style={!canGoForward && styles.disabled}
        >
          <Ionicons name="chevron-forward" size={24} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>
      {monthGrid(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const key = dayKey(date);
            const has = marked.has(key);
            const answered = marked.get(key) === true;
            const isSelected = selected === key;
            return (
              <Pressable
                key={i}
                style={styles.cell}
                disabled={!has}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityLabel={`${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${has ? ", prayer" : ""}${answered ? ", answered" : ""}`}
              >
                <View style={[styles.day, isSelected && styles.daySelected, key === today && !isSelected && styles.dayToday]}>
                  <Text style={[styles.dayText, !has && styles.dayEmpty, isSelected && styles.dayTextSelected]}>{date.getDate()}</Text>
                </View>
                <View style={[styles.dot, !has && styles.noDot, answered && styles.dotAnswered]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, paddingBottom: 6 },
  title: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  disabled: { opacity: 0.3 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 13, fontFamily: fonts.serifSemiBold, color: colors.muted },
  cell: { flex: 1, alignItems: "center", paddingVertical: 2, minHeight: 44 },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { fontSize: 16, color: colors.text },
  dayEmpty: { color: colors.muted },
  dayTextSelected: { color: colors.onAccent },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 2 },
  noDot: { backgroundColor: "transparent" },
  dotAnswered: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
