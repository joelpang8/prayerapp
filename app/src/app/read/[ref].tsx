import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { t } from "../../i18n";
import { fonts, makeStyles, Muted, Span, Text, useColors } from "../../components/ui";
import { chapterTitle, parseRefId } from "../../lib/scripture/reference";
import { getChapter, plainText, versesInChapter, type Chapter } from "../../lib/scripture/text";
import { useSettings } from "../../session/hooks";

/**
 * "Read more": the whole chapter around a verse, in my Bible translation (no
 * network), with the verse that was shown highlighted and scrolled to.
 * Previous/next chapter stay inside the book. Scripture only: nothing here
 * is anyone's content.
 */
export default function ReadScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { ref: refId } = useLocalSearchParams<{ ref: string }>();
  const start = safeParse(refId);
  const [chapter, setChapter] = useState(start?.startChapter ?? 1);
  const [state, setState] = useState<{ key: string; chapter: Chapter | null } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const book = start?.book ?? null;
  const { bibleVersion } = useSettings();
  const key = `${bibleVersion}:${book}:${chapter}`;

  useEffect(() => {
    if (!book) return;
    const k = `${bibleVersion}:${book}:${chapter}`;
    let live = true;
    // My translation; a chapter it numbers differently comes back as the KJV.
    getChapter(book, chapter, bibleVersion).then(
      (c) => { if (live) setState({ key: k, chapter: c }); },
      (err) => {
        console.warn("chapter unavailable", err);
        if (live) setState({ key: k, chapter: null });
      },
    );
    return () => { live = false; };
  }, [book, chapter, bibleVersion]);

  const current = state?.key === key ? state.chapter : undefined;
  const highlight = refId && start ? versesInChapter(refId, chapter) : null;

  if (!start) {
    return (
      <View style={styles.root}>
        <View style={styles.content}><Muted>{t("read.cantOpen")}</Muted></View>
      </View>
    );
  }

  function go(to: number) {
    setChapter(to);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  const nav = current ? (
    <View style={styles.nav}>
      {chapter > 1 ? (
        <Pressable onPress={() => go(chapter - 1)} accessibilityRole="button" accessibilityLabel={t("read.previousChapter", { title: chapterTitle(start.book, chapter - 1) })} hitSlop={8} style={styles.navButton}>
          <Text style={styles.navText}>‹ {chapterTitle(start.book, chapter - 1)}</Text>
        </Pressable>
      ) : <View />}
      {chapter < current.chapters ? (
        <Pressable onPress={() => go(chapter + 1)} accessibilityRole="button" accessibilityLabel={t("read.nextChapter", { title: chapterTitle(start.book, chapter + 1) })} hitSlop={8} style={styles.navButton}>
          <Text style={styles.navText}>{chapterTitle(start.book, chapter + 1)} ›</Text>
        </Pressable>
      ) : <View />}
    </View>
  ) : null;

  return (
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content}>
      {/* Reading mode: the header sits on the same paper as the page. */}
      <Stack.Screen options={{ title: chapterTitle(start.book, chapter), headerStyle: { backgroundColor: colors.paper } }} />
      {current === null && <Muted>{t("read.unavailable")}</Muted>}
      {current && (
        <>
          <Text style={styles.title} accessibilityRole="header">{current.title}</Text>
          <Muted>{t(current?.translation === "RV1909" ? "read.rvNote" : "read.kjvNote")}</Muted>
          <View style={styles.rule} />
          {nav}
          {current.verses.map((v) => {
            const on = !!highlight && v.verse >= highlight.first && v.verse <= highlight.last;
            return (
              <View
                key={v.verse}
                style={[styles.verse, on && styles.verseOn]}
                accessibilityHint={on ? t("read.yourVerse") : undefined}
                onLayout={on && v.verse === highlight!.first
                  ? (e) => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 24), animated: false })
                  : undefined}
              >
                <Text style={styles.text} accessibilityLabel={t("read.verseA11y", { verse: v.verse, text: plainText(v.segments) })}>
                  <Span style={styles.num}>{v.verse} </Span>
                  {v.segments.map((s, j) =>
                    s.supplied ? <Span key={j} style={styles.supplied}>{s.text}</Span> : <Span key={j}>{s.text}</Span>,
                  )}
                </Text>
              </View>
            );
          })}
          <View style={styles.rule} />
          {nav}
        </>
      )}
    </ScrollView>
  );
}

function safeParse(refId: string | undefined) {
  try {
    return refId ? parseRefId(refId) : null;
  } catch {
    return null;
  }
}

const useStyles = makeStyles((colors) => ({
  // Reading mode: warmer paper, a narrower measure and roomier lines.
  root: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56, gap: 4, width: "100%", maxWidth: 640, alignSelf: "center" },
  title: { fontSize: 32, fontFamily: fonts.displayBold, color: colors.text },
  rule: { height: 1, backgroundColor: colors.paperRule, marginVertical: 10 },
  nav: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginVertical: 6 },
  navButton: { minHeight: 44, justifyContent: "center", flexShrink: 1 },
  navText: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
  // Every verse has the same left margin; the verses that were shown get
  // an accent bar in it, as if marked in the margin of a printed Bible.
  verse: { paddingVertical: 5, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: "transparent" },
  verseOn: { borderLeftColor: colors.accent },
  text: { fontSize: 20, lineHeight: 33, color: colors.text, fontFamily: fonts.serif },
  num: { fontSize: 13, color: colors.muted, fontFamily: fonts.serifMedium },
  // EB Garamond's true italic, as the KJV prints the translators' supplied words.
  supplied: { fontFamily: fonts.serifItalic },
}));
