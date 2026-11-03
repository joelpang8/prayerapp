import { useScrollToTop } from "expo-router";
import { useRef } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { CirclesSection } from "../../components/CirclesSection";
import { makeStyles, useColors } from "../../components/ui";
import { usePullToRefresh } from "../../session/usePullToRefresh";

/** The Prayer circles tab: invitations, my circles, and + New circle. */
export default function CirclesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const pull = usePullToRefresh();
  // Tapping this tab again scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.accent} />}
    >
      <CirclesSection />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
}));
