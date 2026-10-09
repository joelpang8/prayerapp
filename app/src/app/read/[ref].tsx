import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { fonts, makeStyles, Muted, Span, Text } from "../../components/ui";
import { chapterTitle, parseRefId } from "../../lib/scripture/reference";
import { getChapter, plainText, versesInChapter, type Chapter } from "../../lib/scripture/text";

/**
 * "Read more": the whole chapter around a verse, from the bundled KJV (no
 * network), with the verse that was shown highlighted and scrolled to.
 * Previous/next chapter stay inside the book. Scripture only: nothing here
 * is anyone's content.
 */
export default function ReadScreen() {
  const styles = useStyles();
  const { ref: refId } = useLocalSearchParams<{ ref: string }>();
  const start = safeParse(refId);
  const [chapter, setChapter] = useState(start?.startChapter ?? 1);
  const [state, setState] = useState<{ key: string; chapter: Chapter | null } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const book = start?.book ?? null;
  const key = `${book}:${chapter}`;

  useEffect(() => {
    if (!book) return;
    const k = `${book}:${chapter}`;
    let live = true;
    getChapter(book, chapter, "KJV").then(
      (c) => { if (live) setState({ key: k, chapter: c }); },
      (err) => {
        console.warn("chapter unavailable", err);
        if (live) setState({ key: k, chapter: null });
      },
    );
    return () => { live = false; };
  }, [book, chapter]);

  const current = state?.key === key ? state.chapter : undefined;
  const highlight = refId && start ? versesInChapter(refId, chapter) : null;

  if (!start) {
    return (
      <View style={styles.root}>
        <View style={styles.content}><Muted>This verse can&apos;t be opened.</Muted></View>
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
        <Pressable onPress={() => go(chapter - 1)} accessibilityRole="button" accessibilityLabel={`Previous chapter, ${chapterTitle(start.book, chapter - 1)}`} hitSlop={8} style={styles.navButton}>
          <Text style={styles.navText}>‹ {chapterTitle(start.book, chapter - 1)}</Text>
        </Pressable>
      ) : <View />}
      {chapter < current.chapters ? (
        <Pressable onPress={() => go(chapter + 1)} accessibilityRole="button" accessibilityLabel={`Next chapter, ${chapterTitle(start.book, chapter + 1)}`} hitSlop={8} style={styles.navButton}>
          <Text style={styles.navText}>{chapterTitle(start.book, chapter + 1)} ›</Text>
        </Pressable>
      ) : <View />}
    </View>
  ) : null;

  return (
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: chapterTitle(start.book, chapter) }} />
      {current === null && <Muted>This chapter isn&apos;t available.</Muted>}
      {current && (
        <>
          <Text style={styles.title} accessibilityRole="header">{current.title}</Text>
          <Muted>King James Version. Words in italics were added by the translators.</Muted>
          {nav}
          {current.verses.map((v) => {
            const on = !!highlight && v.verse >= highlight.first && v.verse <= highlight.last;
            return (
              <View
                key={v.verse}
                style={[styles.verse, on && styles.verseOn]}
                onLayout={on && v.verse === highlight!.first
                  ? (e) => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 24), animated: false })
                  : undefined}
              >
                <Text style={styles.text} accessibilityLabel={`Verse ${v.verse}. ${plainText(v.segments)}`}>
                  <Span style={styles.num}>{v.verse} </Span>
                  {v.segments.map((s, j) =>
                    s.supplied ? <Span key={j} style={styles.supplied}>{s.text}</Span> : <Span key={j}>{s.text}</Span>,
                  )}
                </Text>
              </View>
            );
          })}
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
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  title: { fontSize: 30, fontFamily: fonts.displayBold, color: colors.text },
  nav: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginVertical: 8 },
  navButton: { minHeight: 44, justifyContent: "center", flexShrink: 1 },
  navText: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
  verse: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  verseOn: { backgroundColor: colors.accentSoft },
  text: { fontSize: 19, lineHeight: 28, color: colors.text, fontFamily: fonts.serif },
  num: { fontSize: 13, color: colors.muted, fontFamily: fonts.serifMedium },
  // EB Garamond's true italic, as the KJV prints the translators' supplied words.
  supplied: { fontFamily: fonts.serifItalic },
}));
