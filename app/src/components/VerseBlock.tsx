import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useId, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { formatReference, parseRefId } from "../lib/scripture/reference";
import { plainText, type Passage } from "../lib/scripture/text";
import { spokenLanguage, spokenPassage } from "../lib/verseSpeech";
import { verseShareText } from "../lib/verseShare";
import { db } from "../firebase";
import { t } from "../i18n";
import { saveVerse, unsaveVerse } from "../lib/savedVerses";
import { usePassage, useSavedVerses } from "../session/hooks";
import { useReadySession } from "../session/SessionProvider";
import { useVerseSpeech } from "../session/useVerseSpeech";
import { fonts, makeStyles, Span, Text, useColors } from "./ui";

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
 * readMore: false hides "Read more" (e.g. while posting, so the countdown
 * screen isn't left for the chapter).
 */
export function VerseBlock({ refId, collapsed = false, readMore = true }: { refId: string; collapsed?: boolean; readMore?: boolean }) {
  const styles = useStyles();
  const [open, setOpen] = useState(!collapsed);
  const [all, setAll] = useState(false);
  const { passage, failed } = usePassage(open ? refId : null);
  const reference = passage?.reference ?? displayRef(refId);
  // Per block, so the same verse shown twice doesn't play in both places.
  const { speaking, toggle } = useVerseSpeech(`${refId}#${useId()}`);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityHint={t("verse.showsVerse")}>
        <Text style={styles.refLink}>{reference}</Text>
      </Pressable>
    );
  }
  const long = !!passage && passage.verses.length > PREVIEW_VERSES;
  return (
    <View style={styles.block}>
      {passage ? <Verses passage={passage} limit={all ? Infinity : PREVIEW_VERSES} /> : failed ? <Text style={styles.muted}>{t("verse.unavailable")}</Text> : null}
      {long && !all && (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button">
          <Text style={styles.more}>{t("verse.showAll", { count: passage!.verses.length })}</Text>
        </Pressable>
      )}
      <View style={styles.refRow}>
        <Text style={styles.ref}>
          {reference}
          {passage ? ` (${passage.translation})` : ""}
        </Text>
        {passage && (
          <View style={styles.actions}>
            <SaveButton refId={refId} reference={reference} />
            <ListenButton speaking={speaking} reference={reference} onPress={() => toggle(spokenPassage(passage), spokenLanguage(passage))} />
          </View>
        )}
      </View>
      {passage && (
        <View style={styles.bottomRow}>
          {readMore ? (
            <Pressable
              onPress={() => router.push({ pathname: "/read/[ref]", params: { ref: refId } })}
              accessibilityRole="link"
              accessibilityLabel={t("verse.readMoreA11y", { ref: reference })}
              hitSlop={8}
              style={styles.readMore}
            >
              <Text style={styles.more}>{t("verse.readMore")}</Text>
            </Pressable>
          ) : <View />}
          <ShareButton passage={passage} reference={reference} />
        </View>
      )}
    </View>
  );
}

/**
 * Save to (or remove from) my saved verses, to read or listen to again from
 * the Prayers tab. Only the reference is saved; nobody else sees the list.
 */
function SaveButton({ refId, reference }: { refId: string; reference: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const { isSaved } = useSavedVerses();
  const [busy, setBusy] = useState(false);
  const saved = isSaved(refId);
  async function toggle() {
    setBusy(true);
    try {
      if (saved) await unsaveVerse(db, profile.uid, refId);
      else await saveVerse(db, profile.uid, refId);
    } catch (err) {
      console.warn("save verse failed", err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: saved, busy }}
      accessibilityLabel={t(saved ? "verse.savedA11y" : "verse.saveA11y", { ref: reference })}
      accessibilityHint={t(saved ? "verse.savedHint" : "verse.saveHint")}
      hitSlop={8}
      style={styles.listen}
    >
      <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={colors.accent} />
      <Text style={styles.listenText}>{t(saved ? "verse.saved" : "verse.save")}</Text>
    </Pressable>
  );
}

/** Share or copy the verse (text and reference only) through the iPhone's share sheet. */
function ShareButton({ passage, reference }: { passage: Passage; reference: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      onPress={() => { Share.share({ message: verseShareText(passage) }).catch(() => {}); }}
      accessibilityRole="button"
      accessibilityLabel={t("verse.shareA11y", { ref: reference })}
      accessibilityHint={t("verse.shareHint")}
      hitSlop={8}
      style={styles.listen}
    >
      <Ionicons name="share-outline" size={20} color={colors.accent} />
      <Text style={styles.listenText}>{t("verse.share")}</Text>
    </Pressable>
  );
}

/** Reads the verse aloud with the phone's voice, only when tapped. */
function ListenButton({ speaking, reference, onPress }: { speaking: boolean; reference: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t(speaking ? "verse.stopA11y" : "verse.listenA11y", { ref: reference })}
      accessibilityHint={speaking ? undefined : t("verse.listenHint")}
      hitSlop={8}
      style={styles.listen}
    >
      <Ionicons name={speaking ? "stop-circle-outline" : "volume-medium-outline"} size={22} color={colors.accent} />
      <Text style={styles.listenText}>{t(speaking ? "verse.stop" : "verse.listen")}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 12, gap: 6 },
  text: { fontSize: 19, lineHeight: 28, color: colors.text, fontFamily: fonts.serif },
  num: { fontSize: 13, color: colors.muted, fontFamily: fonts.serifMedium },
  // EB Garamond's true italic, as the KJV prints the translators' supplied words.
  supplied: { fontFamily: fonts.serifItalic },
  ref: { fontSize: 16, color: colors.muted, fontFamily: fonts.display, flexShrink: 1 },
  refRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 14 },
  listen: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  listenText: { fontSize: 15, color: colors.accent, fontFamily: fonts.serifSemiBold },
  refLink: { fontSize: 17, color: colors.accent, fontFamily: fonts.display },
  more: { fontSize: 15, color: colors.accent },
  readMore: { alignSelf: "flex-start", paddingVertical: 4 },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  muted: { fontSize: 15, color: colors.muted },
}));
