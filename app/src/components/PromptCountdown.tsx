import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { candleLeft, mmss, windowState } from "../lib/promptWindow";
import { Candle } from "./Candle";
import { fonts, makeStyles, Text, useColors } from "./ui";
import { t } from "../i18n";

/** The current countdown, re-read twice a second until the post would be late. */
function useWindow(firedAt: Date) {
  const [now, setNow] = useState(() => Date.now());
  const state = windowState(firedAt.getTime(), now);
  const live = state.phase !== "late";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [live]);
  return { ...state, candle: candleLeft(firedAt.getTime(), now) };
}

/**
 * BeReal-style countdown after a prompt: big mm:ss for the 2 minutes to
 * pray, then the grace period that still counts as on time. Once late it
 * shows `whenLate` instead, switching the moment time runs out.
 */
export function PromptCountdown({ firedAt, whenLate = null }: { firedAt: Date; whenLate?: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  const w = useWindow(firedAt);
  if (w.phase === "late") return <>{whenLate}</>;
  const urgent = w.phase === "respond" && w.msLeft <= 10_000;
  return (
    <View style={styles.root} accessible accessibilityLabel={t(w.phase === "grace" ? "countdown.leftGrace" : "countdown.leftToPray", { time: mmss(w.msLeft) })}>
      <Candle left={w.candle} />
      <Text style={[styles.time, urgent && { color: colors.danger }]}>{mmss(w.msLeft)}</Text>
      <Text style={styles.label}>{w.phase === "respond" ? t("countdown.timeToPray") : t("countdown.grace")}</Text>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${Math.round(w.fractionLeft * 100)}%` }, w.phase === "grace" && styles.barGrace]} />
      </View>
    </View>
  );
}

/** Small version for the posting screen: "01:43 left" / "on time for 04:12" / "Late". */
export function CountdownPill({ firedAt }: { firedAt: Date }) {
  const styles = useStyles();
  const w = useWindow(firedAt);
  const text =
    w.phase === "respond" ? t("countdown.leftToPray", { time: mmss(w.msLeft) })
      : w.phase === "grace" ? t("countdown.onTimeFor", { time: mmss(w.msLeft) })
        : t("countdown.willBeLate");
  return (
    <View style={[styles.pill, w.phase === "late" && styles.pillLate]}>
      <Text style={[styles.pillText, w.phase === "late" && styles.pillTextLate]}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", gap: 4, paddingVertical: 8 },
  // Tabular figures so the digits don't shift as they change.
  time: { fontSize: 72, lineHeight: 80, fontFamily: fonts.displayBold, color: colors.text, fontVariant: ["tabular-nums"] },
  label: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  track: { alignSelf: "stretch", height: 6, borderRadius: 3, backgroundColor: colors.accentSoft, overflow: "hidden", marginTop: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  barGrace: { backgroundColor: colors.muted },
  pill: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  pillLate: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  pillText: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent, fontVariant: ["tabular-nums"] },
  pillTextLate: { color: colors.muted },
}));
