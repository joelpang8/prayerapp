import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { makeStyles } from "./ui";

const MAX_WAX = 64;
const MIN_WAX = 8;

/**
 * A small candle that burns down over the prayer window. Purely decorative
 * (hidden from VoiceOver; the countdown says the time). The flame flickers
 * at uneven moments, sways a little from its base and its glow breathes,
 * like a real flame, unless the phone's Reduce Motion setting is on.
 */
export function Candle({ left }: { left: number }) {
  const styles = useStyles();
  const flicker = useFlicker();
  const wax = MIN_WAX + (MAX_WAX - MIN_WAX) * Math.max(0, Math.min(1, left));
  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <View style={styles.flameArea}>
        <Animated.View style={[styles.glow, { opacity: flicker.glow }]}>
          <View style={styles.glowInner} />
        </Animated.View>
        <Animated.View
          style={[styles.flameBox, { transform: [{ rotate: flicker.sway }, { scaleY: flicker.scaleY }, { scaleX: flicker.scaleX }] }]}
        >
          <View style={styles.flame}>
            <Animated.View style={[styles.core, { opacity: flicker.core }]} />
          </View>
        </Animated.View>
      </View>
      <View style={styles.wick} />
      <View style={[styles.wax, { height: wax }]} />
      <View style={styles.dish} />
    </View>
  );
}

type Flicker = {
  scaleY: Animated.Value;
  scaleX: Animated.AnimatedDivision<number>;
  sway: Animated.AnimatedInterpolation<string>;
  glow: Animated.Value;
  core: Animated.Value;
};

/**
 * Each part moves on its own, to a random next value after a random time,
 * so the flame never repeats a pattern: the height flickers quickly, the
 * flame leans slowly side to side, and the glow and bright core breathe.
 */
function useFlicker(): Flicker {
  const [values] = useState(() => {
    const height = new Animated.Value(1);
    const lean = new Animated.Value(0);
    return {
      height,
      lean,
      glow: new Animated.Value(0.35),
      core: new Animated.Value(1),
      scaleX: Animated.divide(1, height),
      sway: lean.interpolate({ inputRange: [-1, 1], outputRange: ["-4deg", "4deg"] }),
    };
  });
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => setReduceMotion(true));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const { height, lean, glow, core } = values;
    if (reduceMotion) {
      height.setValue(1);
      lean.setValue(0);
      glow.setValue(0.35);
      core.setValue(1);
      return;
    }
    let running = true;
    const wander = (value: Animated.Value, next: () => number, ms: () => number) => {
      const step = () => {
        if (!running) return;
        Animated.timing(value, { toValue: next(), duration: ms(), easing: Easing.inOut(Easing.sin), useNativeDriver: true })
          .start(({ finished }) => { if (finished) step(); });
      };
      step();
    };
    const between = (lo: number, hi: number) => () => lo + Math.random() * (hi - lo);
    wander(height, between(0.9, 1.14), between(90, 420));
    wander(lean, between(-1, 1), between(700, 1600));
    wander(glow, between(0.22, 0.5), between(400, 1100));
    wander(core, between(0.7, 1), between(120, 500));
    return () => {
      running = false;
      height.stopAnimation();
      lean.stopAnimation();
      glow.stopAnimation();
      core.stopAnimation();
    };
  }, [reduceMotion, values]);
  return { scaleY: values.height, scaleX: values.scaleX, sway: values.sway, glow: values.glow, core: values.core };
}

const useStyles = makeStyles((colors) => ({
  root: { alignItems: "center", justifyContent: "flex-end", height: MAX_WAX + 40, marginBottom: 4 },
  // Leans from its base, like a flame on a wick.
  flameBox: { alignItems: "center", justifyContent: "flex-end", height: 26, transformOrigin: "50% 100%" },
  flameArea: { alignItems: "center", justifyContent: "flex-end", height: 26 },
  // A soft light around the flame: a faint wide disc, a warmer smaller one
  // with a blurred edge (its shadow), breathing together.
  glow: { position: "absolute", bottom: -10, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.flame, alignItems: "center", justifyContent: "center" },
  glowInner: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.flameCore, shadowColor: colors.flame, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
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
