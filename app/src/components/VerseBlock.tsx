import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatReference, parseRefId } from "../lib/scripture/reference";
import { plainText, type Passage } from "../lib/scripture/text";
import { usePassage } from "../session/hooks";
import { fonts, makeStyles, Span, Text } from "./ui";

const PREVIEW_VERSES = 4;

function displayRef(refId: string): string {
  try {
    return formatReference(parseRefId(refId));
  } catch {
    return refId;
  }
}

function Verses({ passage, limit }: { passage: Passage; limit: number }) {
  const styles = useStyles();
  const shown = passage.verses.slice(0, limit);
  const showNumbers = passage.verses.length > 1;
  return (
    <Text style={styles.text} accessibilityLabel={shown.map((v) => plainText(v.segments)).join(" ")}>
      {shown.map((v, i) => (
        <Span key={`${v.chapter}:${v.verse}`}>
          {i > 0 ? " " : ""}
          {showNumbers && <Span style={styles.num}>{v.verse} </Span>}
          {v.segments.map((s, j) =>
            // KJV prints the translators' supplied words in italics.
            s.supplied ? <Span key={j} style={styles.supplied}>{s.text}</Span> : <Span key={j}>{s.text}</Span>,
          )}
        </Span>
      ))}
    </Text>
  );
}

/**
 * A verse reference rendered in the viewer's translation.
 * collapsed: show just the reference; tap to show the text.
 */
export function VerseBlock({ refId, collapsed = false }: { refId: string; collapsed?: boolean }) {
  const styles = useStyles();
  const [open, setOpen] = useState(!collapsed);
  const [all, setAll] = useState(false);
  const { passage, failed } = usePassage(open ? refId : null);
  const reference = passage?.reference ?? displayRef(refId);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityHint="Shows the verse">
        <Text style={styles.refLink}>{reference}</Text>
      </Pressable>
    );
  }
  const long = !!passage && passage.verses.length > PREVIEW_VERSES;
  return (
    <View style={styles.block}>
      {passage ? <Verses passage={passage} limit={all ? Infinity : PREVIEW_VERSES} /> : failed ? <Text style={styles.muted}>This verse isn&apos;t available in your translation.</Text> : null}
      {long && !all && (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button">
          <Text style={styles.more}>Show all {passage!.verses.length} verses</Text>
        </Pressable>
      )}
      <Text style={styles.ref}>
        {reference}
        {passage ? ` (${passage.translation})` : ""}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12, gap: 6 },
  text: { fontSize: 19, lineHeight: 28, color: colors.text, fontFamily: fonts.serif },
  num: { fontSize: 13, color: colors.muted, fontFamily: fonts.serifMedium },
  // EB Garamond's true italic, as the KJV prints the translators' supplied words.
  supplied: { fontFamily: fonts.serifItalic },
  ref: { fontSize: 16, color: colors.muted, fontFamily: fonts.display },
  refLink: { fontSize: 17, color: colors.accent, fontFamily: fonts.display },
  more: { fontSize: 15, color: colors.accent },
  muted: { fontSize: 15, color: colors.muted },
}));
