import { useState } from "react";
import { Pressable, View } from "react-native";
import { ACTS_STEPS, hintVisible, type ActsStep } from "../lib/acts";
import { fonts, makeStyles, Muted, Text } from "./ui";

/**
 * "Help me start": four optional prompts (praise, sorry, thanks, asking).
 * Tapping one shows its question as a hint that goes away as soon as they
 * type. Nothing is added to the notes and nothing is saved.
 */
export function PrayerHelper({ notes }: { notes: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ step: ActsStep; notesAtTap: string } | null>(null);
  const visible = hintVisible(shown, notes);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => { setOpen((o) => !o); setShown(null); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint="Optional prompts to help you write"
        hitSlop={8}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{open ? "Hide prompts" : "Help me start"}</Text>
      </Pressable>
      {open && (
        <>
          <View style={styles.chips}>
            {ACTS_STEPS.map((step) => {
              const selected = visible && shown?.step.id === step.id;
              return (
                <Pressable
                  key={step.id}
                  onPress={() => setShown({ step, notesAtTap: notes })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${step.label}: ${step.hint}`}
                  style={[styles.chip, selected && styles.chipOn]}
                  hitSlop={4}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{step.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {visible && shown ? (
            <View style={styles.hint} accessibilityLiveRegion="polite">
              <Text style={styles.hintText}>{shown.step.hint}</Text>
            </View>
          ) : (
            <Muted>Optional. Tap one for a question to think about; it disappears as you type. (Sometimes called ACTS.)</Muted>
          )}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8 },
  toggle: { alignSelf: "flex-start", paddingVertical: 4 },
  toggleText: { fontSize: 16, fontFamily: fonts.serifSemiBold, color: colors.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 16, color: colors.text },
  chipTextOn: { color: colors.accent, fontFamily: fonts.serifSemiBold },
  hint: { backgroundColor: colors.accentSoft, borderRadius: 10, padding: 12 },
  hintText: { fontSize: 17, lineHeight: 24, fontFamily: fonts.serifItalic, color: colors.text },
}));
