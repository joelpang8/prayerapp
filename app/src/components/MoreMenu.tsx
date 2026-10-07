import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { db } from "../firebase";
import { blockUser, fileReport, REPORT_REASONS, type ReportReason, type ReportTarget } from "../lib/moderation";
import { useFriendGraph, useReadySession } from "../session/SessionProvider";
import { Button, ErrorText, fonts, makeStyles, Muted, Text, TextInput, useColors } from "./ui";

const NOUN = { user: "person", post: "prayer", comment: "comment" } as const;

/** Block someone after confirming; ends the friendship. Returns a function to call. */
export function useBlock() {
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  return (uid: string, name: string, after?: () => void) =>
    Alert.alert(
      `Block ${name}?`,
      "You'll stop being friends and won't see each other's prayers, comments or reactions. They won't be told. You can unblock them in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () =>
            blockUser(db, me.uid, uid, {
              iFollowThem: graph.friends.has(uid) || graph.outgoing.has(uid),
              theyFollowMe: graph.friends.has(uid) || graph.incoming.has(uid),
            }).then(after, () => Alert.alert("Couldn't block", "Please try again.")),
        },
      ],
    );
}

/**
 * The "⋯" button on someone else's prayer, comment or profile: Report or
 * Block. Never shown on your own things.
 */
export function MoreMenu({ target, name }: { target: ReportTarget; name: string }) {
  const colors = useColors();
  const { profile: me } = useReadySession();
  const block = useBlock();
  const [reporting, setReporting] = useState(false);
  if (target.targetUid === me.uid) return null;

  const open = () =>
    Alert.alert(target.kind === "user" ? name : `This ${NOUN[target.kind]}`, undefined, [
      { text: `Report ${NOUN[target.kind]}…`, onPress: () => setReporting(true) },
      { text: `Block ${name}`, style: "destructive", onPress: () => block(target.targetUid, name) },
      { text: "Cancel", style: "cancel" },
    ]);

  return (
    <>
      <Pressable onPress={open} hitSlop={12} accessibilityRole="button" accessibilityLabel={`More options for ${target.kind === "user" ? name : `this ${NOUN[target.kind]}`}`}>
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
      </Pressable>
      {reporting && <ReportSheet target={target} name={name} onClose={() => setReporting(false)} />}
    </>
  );
}

function ReportSheet({ target, name, onClose }: { target: ReportTarget; name: string; onClose: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const { profile: me } = useReadySession();
  const { graph } = useFriendGraph();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(target.kind === "user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await fileReport(db, me.uid, target, reason, note);
      if (alsoBlock) {
        await blockUser(db, me.uid, target.targetUid, {
          iFollowThem: graph.friends.has(target.targetUid) || graph.outgoing.has(target.targetUid),
          theyFollowMe: graph.friends.has(target.targetUid) || graph.incoming.has(target.targetUid),
        });
      }
      onClose();
      Alert.alert(
        "Thank you for telling us",
        [
          "We'll review it.",
          target.kind !== "user" ? `You won't see this ${NOUN[target.kind]} again.` : "",
          alsoBlock ? `${name} is blocked.` : "",
          reason === "harm" ? "\n\nIf someone is in immediate danger, please contact local emergency services." : "",
        ].filter(Boolean).join(" "),
      );
    } catch (err) {
      console.warn("report failed", err);
      setError("Couldn't send the report. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Report {target.kind === "user" ? name : `this ${NOUN[target.kind]}`}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Muted>What&apos;s wrong? Reports are private: {name} won&apos;t know who reported them.</Muted>
          {REPORT_REASONS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setReason(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r.id }}
              style={styles.row}
            >
              <Text style={styles.rowText}>{r.label}</Text>
              <Ionicons name={reason === r.id ? "radio-button-on" : "radio-button-off"} size={22} color={colors.accent} />
            </Pressable>
          ))}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything else we should know? (optional)"
            multiline
            maxLength={500}
            style={styles.input}
          />
          <View style={styles.row}>
            <Text style={styles.rowText}>Also block {name}</Text>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} trackColor={{ true: colors.accent, false: colors.border }} />
          </View>
          {error && <ErrorText>{error}</ErrorText>}
          <Button title="Send report" onPress={submit} busy={busy} disabled={!reason} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontFamily: fonts.display, color: colors.text, flex: 1 },
  link: { fontSize: 17, fontFamily: fonts.serifSemiBold, color: colors.accent },
  body: { padding: 20, gap: 12, paddingBottom: 48 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48, gap: 12 },
  rowText: { fontSize: 17, color: colors.text, flex: 1 },
  input: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, textAlignVertical: "top", backgroundColor: colors.card },
}));
