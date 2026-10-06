import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { db } from "../firebase";
import { react, reactionInfo, REACTIONS, summarize, unreact, type ReactionKind } from "../lib/reactions";
import { useReactions } from "../session/hooks";
import { useReadySession } from "../session/SessionProvider";
import { useProfiles } from "../session/useProfiles";
import { makeStyles, Text, useColors } from "./ui";

/**
 * Reactions on a post, BeReal-style: counts of each preset, and (on other
 * people's posts) a button that opens the presets. One reaction per person;
 * tapping your current one again removes it.
 */
export function ReactionBar({ post }: { post: { id: string; authorId: string } }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile: me } = useReadySession();
  const reactions = useReactions(post.id, post.authorId);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(false);
  // Which reaction's people are shown (tap a count to see who).
  const [showing, setShowing] = useState<ReactionKind | null>(null);
  const names = useProfiles(new Set(reactions.map((r) => r.authorId).filter((u) => u !== me.uid)));
  const whoReacted = (kind: ReactionKind) =>
    reactions
      .filter((r) => r.kind === kind)
      .map((r) => (r.authorId === me.uid ? "You" : names.get(r.authorId)?.displayName ?? "…"))
      .join(", ");
  const mine = reactions.find((r) => r.authorId === me.uid)?.kind ?? null;
  const canReact = post.authorId !== me.uid;
  const counts = summarize(reactions);

  async function choose(kind: ReactionKind) {
    setPicking(false);
    setError(false);
    try {
      if (kind === mine) await unreact(db, post.id, me.uid);
      else await react(db, post.id, me.uid, kind);
    } catch (err) {
      console.warn("reaction failed", err);
      setError(true);
    }
  }

  if (!canReact && counts.length === 0) return null;
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {counts.map((c) => (
          <Pressable
            key={c.kind}
            onPress={() => setShowing(showing === c.kind ? null : c.kind)}
            onLongPress={() => setShowing(c.kind)}
            accessibilityRole="button"
            accessibilityLabel={`${reactionInfo(c.kind).label}: ${whoReacted(c.kind)}`}
            accessibilityHint="Shows who reacted"
            style={[styles.chip, c.kind === mine && styles.chipMine, showing === c.kind && styles.chipShowing]}
          >
            <Text style={styles.emoji}>{c.emoji}</Text>
            <Text style={styles.count}>{c.count}</Text>
          </Pressable>
        ))}
        {canReact && (
          <Pressable
            onPress={() => setPicking(!picking)}
            accessibilityRole="button"
            accessibilityLabel={picking ? "Close reactions" : "React"}
            style={[styles.chip, styles.add]}
            hitSlop={6}
          >
            <Ionicons name={picking ? "close" : "happy-outline"} size={20} color={colors.accent} />
            {!picking && <Text style={styles.addText}>{mine ? "Change" : "React"}</Text>}
          </Pressable>
        )}
      </View>
      {showing && counts.some((c) => c.kind === showing) && (
        <Text style={styles.who}>
          {reactionInfo(showing).emoji} {reactionInfo(showing).label}: {whoReacted(showing)}
        </Text>
      )}
      {picking && (
        <View style={styles.picker}>
          {REACTIONS.map((r) => (
            <Pressable
              key={r.kind}
              onPress={() => choose(r.kind)}
              accessibilityRole="button"
              accessibilityLabel={r.kind === mine ? `Remove ${r.label}` : r.label}
              accessibilityState={{ selected: r.kind === mine }}
              style={[styles.option, r.kind === mine && styles.optionMine]}
            >
              <Text style={styles.optionEmoji}>{r.emoji}</Text>
              <Text style={styles.optionLabel} numberOfLines={2}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error && <Text style={styles.error}>Couldn&apos;t save your reaction. Please try again.</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, minHeight: 32 },
  chipMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipShowing: { borderColor: colors.text },
  who: { fontSize: 15, color: colors.muted },
  emoji: { fontSize: 16 },
  count: { fontSize: 15, color: colors.text },
  add: { borderColor: colors.accent },
  addText: { fontSize: 15, color: colors.accent },
  picker: { flexDirection: "row", flexWrap: "wrap", gap: 6, backgroundColor: colors.bg, borderRadius: 12, padding: 8 },
  option: { width: "31%", alignItems: "center", paddingVertical: 8, borderRadius: 10, gap: 2 },
  optionMine: { backgroundColor: colors.accentSoft },
  optionEmoji: { fontSize: 28 },
  optionLabel: { fontSize: 13, color: colors.muted, textAlign: "center" },
  error: { fontSize: 14, color: colors.danger },
}));
