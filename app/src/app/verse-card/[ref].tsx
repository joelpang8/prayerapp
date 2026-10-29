import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sharing from "expo-sharing";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { Button, ErrorText, fonts, makeStyles, Muted, palettes, Span, Text, useColors } from "../../components/ui";
import { t } from "../../i18n";
import { cardFontSize, CARD_VERSES, cardVerses } from "../../lib/verseCard";
import { usePassage } from "../../session/hooks";

type Look = "light" | "dark";

/**
 * "Share as image": the verse as a card in the app's fonts and colors, to
 * share as a picture. Only the verse, its reference and the app's name: no
 * one's prayer, name or post. The picture is made on the phone for the share
 * sheet and removed afterwards.
 */
export default function VerseCardScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const { passage, failed } = usePassage(ref ?? null);
  const [look, setLook] = useState<Look>("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const card = useRef<View>(null);

  async function share() {
    setBusy(true);
    setError(false);
    let uri: string | null = null;
    try {
      uri = await captureRef(card, { format: "png", quality: 1, width: 1080, height: 1350, result: "tmpfile" });
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: t("verseCard.title") });
    } catch (err) {
      console.warn("verse card failed", err);
      setError(true);
    } finally {
      if (uri) releaseCapture(uri);
      setBusy(false);
    }
  }

  const p = palettes[look];
  const shown = passage ? cardVerses(passage) : null;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("verseCard.title") }} />
      {failed && <Muted>{t("verse.unavailable")}</Muted>}
      {passage && shown && (
        <>
          <View ref={card} collapsable={false} style={[styles.card, { backgroundColor: p.paper, borderColor: p.paperRule }]}>
            <Text style={[styles.mark, { color: p.flame }]} accessibilityElementsHidden importantForAccessibility="no">✦</Text>
            <Text style={[styles.verse, { color: p.text, fontSize: cardFontSize(shown.text), lineHeight: Math.round(cardFontSize(shown.text) * 1.45) }]}>
              {shown.segments.map((s, i) =>
                s.supplied ? <Span key={i} style={styles.supplied}>{s.text}</Span> : <Span key={i}>{s.text}</Span>,
              )}
              {shown.more ? "…" : ""}
            </Text>
            <Text style={[styles.ref, { color: p.accent }]}>{`${passage.reference} (${passage.translation})`}</Text>
            <Text style={[styles.brand, { color: p.muted }]}>PrayAlong</Text>
          </View>
          {shown.more && <Muted>{t("verseCard.firstVerses", { count: CARD_VERSES })}</Muted>}

          <View style={styles.looks} accessibilityRole="radiogroup">
            {(["light", "dark"] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => setLook(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: look === l }}
                style={[styles.look, look === l && { borderColor: colors.accent }]}
              >
                <View style={[styles.swatch, { backgroundColor: palettes[l].paper, borderColor: palettes[l].paperRule }]} />
                <Text style={styles.lookText}>{t(l === "light" ? "verseCard.light" : "verseCard.dark")}</Text>
                {look === l && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </Pressable>
            ))}
          </View>
          <Button title={t("verseCard.share")} onPress={share} busy={busy} />
          {error && <ErrorText>{t("verseCard.failed")}</ErrorText>}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  // 4:5, the shape Instagram and Messages show best.
  card: { width: "100%", aspectRatio: 4 / 5, borderRadius: 16, borderWidth: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: "center", gap: 18 },
  mark: { fontSize: 22, textAlign: "center" },
  verse: { fontFamily: fonts.scripture, textAlign: "center" },
  supplied: { fontFamily: fonts.scriptureItalic },
  ref: { fontFamily: fonts.display, fontSize: 18, textAlign: "center" },
  brand: { fontFamily: fonts.bodySemiBold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginTop: 8 },
  looks: { flexDirection: "row", gap: 10 },
  look: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, minHeight: 48 },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1 },
  lookText: { flex: 1, fontSize: 15, color: colors.text },
}));
