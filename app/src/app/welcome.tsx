import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, fonts, makeStyles, Text, useColors } from "../components/ui";
import { TUTORIAL_PAGES } from "../lib/tutorial";

/** "How PrayAlong works": three short pages, one at a time, with Skip. */
export default function WelcomeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const [index, setIndex] = useState(0);
  const page = TUTORIAL_PAGES[index];
  const last = index === TUTORIAL_PAGES.length - 1;
  // VoiceOver: move to the new page's title when the page changes.
  const titleRef = useRef<View>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus");
  }, [index]);

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        {!last && (
          <Pressable onPress={done} accessibilityRole="button" accessibilityLabel="Skip the introduction" hitSlop={10} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.art} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Ionicons name={page.icon} size={44} color={colors.accent} />
        </View>
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={`${page.title}. Page ${index + 1} of ${TUTORIAL_PAGES.length}`}>
          <Text style={styles.title}>{page.title}</Text>
        </View>
        <Text style={styles.text}>{page.body}</Text>
      </ScrollView>
      <View style={styles.bottom}>
        <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {TUTORIAL_PAGES.map((p, i) => (
            <View key={p.title} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <Button title={last ? "Start praying" : "Next"} size="large" onPress={() => (last ? done() : setIndex(index + 1))} />
        {index > 0 && <Button title="Back" kind="secondary" onPress={() => setIndex(index - 1)} />}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingTop: 8, minHeight: 52 },
  skip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  skipText: { fontSize: 17, color: colors.accent, fontFamily: fonts.serifSemiBold },
  body: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, paddingVertical: 24, gap: 16 },
  art: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 30, fontFamily: fonts.display, color: colors.text, textAlign: "center" },
  text: { fontSize: 18, lineHeight: 27, color: colors.muted, textAlign: "center", maxWidth: 380 },
  bottom: { paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
}));
