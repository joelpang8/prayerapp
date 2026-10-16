import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { makeStyles } from "./ui";

const MAX_WAX = 64;
const MIN_WAX = 8;

/**
 * A small candle that burns down over the prayer window. Purely decorative
 * (hidden from VoiceOver; the countdown says the time). The flame flickers
 * gently unless the phone's Reduce Motion setting is on.
 */
export function Candle({ left }: { left: number }) {
  const styles = useStyles();
  const flicker = useFlicker();
  const wax = MIN_WAX + (MAX_WAX - MIN_WAX) * Math.max(0, Math.min(1, left));
  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Animated.View style={[styles.flameBox, { transform: [{ scaleY: flicker.scaleY }, { scaleX: flicker.scaleX }] }]}>
        <View style={styles.flame}>
          <View style={styles.core} />
        </View>
      </Animated.View>
      <View style={styles.wick} />
      <View style={[styles.wax, { height: wax }]} />
      <View style={styles.dish} />
    </View>
  );
}

function useFlicker(): { scaleY: Animated.Value; scaleX: Animated.AnimatedDivision<number> } {
  const [value] = useState(() => new Animated.Value(1));
  const [scaleX] = useState(() => Animated.divide(1, value));
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => setReduceMotion(true));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      value.setValue(1);
      return;
    }
    const step = (to: number, ms: number) => Animated.timing(value, { toValue: to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([step(1.08, 700), step(0.95, 900), step(1.04, 600), step(1, 800)]));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, value]);
  return { scaleY: value, scaleX };
}

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", justifyContent: "flex-end", height: MAX_WAX + 40, marginBottom: 4 },
  flameBox: { alignItems: "center", justifyContent: "flex-end", height: 26 },
  // A teardrop: a square with one sharp corner, turned to point up.
  flame: {
    width: 16, height: 16, marginBottom: 2, backgroundColor: colors.flame,
    borderTopLeftRadius: 0, borderTopRightRadius: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    transform: [{ rotate: "45deg" }], alignItems: "center", justifyContent: "center",
  },
  core: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.flameCore, transform: [{ translateX: 1.5 }, { translateY: 1.5 }] },
  wick: { width: 2, height: 5, backgroundColor: colors.text, borderRadius: 1 },
  wax: { width: 26, backgroundColor: colors.wax, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1, borderColor: colors.border, borderBottomWidth: 0 },
  dish: { width: 52, height: 6, borderRadius: 3, backgroundColor: colors.border },
}));
