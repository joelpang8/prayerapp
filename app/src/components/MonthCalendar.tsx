import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { dayKey, monthGrid, monthTitle, weekdayLetters, type YearMonth } from "../lib/calendar";
import { locale, t } from "../i18n";
import { dayKeyOfPromptId } from "../lib/monthRecap";
import { appDayId } from "../lib/onThisDay";
import { useReadySession } from "../session/SessionProvider";
import { usePhoto } from "../session/hooks";
import { fonts, makeStyles, Text, useColors } from "./ui";

/** A day with a prayer: its photo for the thumbnail, and whether it was answered. */
export type MarkedDay = { answered: boolean; photoPath: string | null };

/**
 * A month of days. Days with a prayer show that day's photo as a small
 * thumbnail with the date on it (a gold edge if it was answered) and can be
 * tapped; the rest are plain. Only ever my own photos.
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
  /** dayKey -> that day's prayer. */
  marked: ReadonlyMap<string, MarkedDay>;
  selected: string | null;
  onSelect: (day: string) => void;
  onChangeMonth: (delta: number) => void;
  canGoForward: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  // Today by the app's day (America/New_York), like the prayers it marks.
  const today = dayKeyOfPromptId(appDayId(new Date()));
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => onChangeMonth(-1)} accessibilityRole="button" accessibilityLabel={t("prayers.cal.previousMonth")} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.title}>{monthTitle(month)}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel={t("prayers.cal.nextMonth")}
          hitSlop={12}
          style={!canGoForward && styles.disabled}
        >
          <Ionicons name="chevron-forward" size={24} color={colors.accent} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {weekdayLetters().map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>
      {monthGrid(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const key = dayKey(date);
            const mark = marked.get(key);
            const has = !!mark;
            const answered = !!mark?.answered;
            const isSelected = selected === key;
            return (
              <Pressable
                key={i}
                style={styles.cell}
                disabled={!has}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityLabel={`${date.toLocaleDateString(locale(), { month: "long", day: "numeric" })}${has ? t("prayers.cal.hasPrayer") : ""}${answered ? t("prayers.cal.answered") : ""}`}
              >
                {mark?.photoPath ? (
                  <Thumb path={mark.photoPath} day={date.getDate()} answered={answered} selected={isSelected} />
                ) : (
                  <>
                    <View style={[styles.day, isSelected && styles.daySelected, key === today && !isSelected && styles.dayToday]}>
                      <Text style={[styles.dayText, !has && styles.dayEmpty, isSelected && styles.dayTextSelected]}>{date.getDate()}</Text>
                    </View>
                    <View style={[styles.dot, !has && styles.noDot, answered && styles.dotAnswered]} />
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** That day's photo, small, with the date on it. A soft placeholder while it loads. */
function Thumb({ path, day, answered, selected }: { path: string; day: number; answered: boolean; selected: boolean }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  const uri = usePhoto(path, profile.uid);
  return (
    <View style={[styles.thumb, answered && styles.thumbAnswered, selected && styles.thumbSelected]}>
      {/* cachePolicy "none": the photo stays in PhotoCache (memory) only. */}
      {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />}
      <View style={[styles.thumbDate, !uri && styles.thumbDateLoading]}>
        <Text style={[styles.thumbText, !uri && styles.dayText]}>{day}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, paddingBottom: 6 },
  title: { fontSize: 19, fontFamily: fonts.display, color: colors.text },
  disabled: { opacity: 0.3 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
  cell: { flex: 1, alignItems: "center", paddingVertical: 2, minHeight: 46 },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { fontSize: 15, color: colors.text },
  dayEmpty: { color: colors.muted },
  dayTextSelected: { color: colors.onAccent },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 2 },
  noDot: { backgroundColor: "transparent" },
  thumb: {
    width: 40, height: 40, borderRadius: 10, overflow: "hidden", backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  // Answered: the same quiet gold as on the post.
  thumbAnswered: { borderWidth: 2, borderColor: colors.gold },
  thumbSelected: { borderWidth: 3, borderColor: colors.accent },
  // The date sits on a soft dark wash so it reads on any photo.
  thumbDate: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center" },
  thumbDateLoading: { backgroundColor: "transparent" },
  thumbText: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.onScrim },
  // Answered: the same quiet gold as on the post.
  dotAnswered: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.goldSoft },
}));
