import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { MonthCalendar } from "../../components/MonthCalendar";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { fonts, makeStyles, Muted, Text } from "../../components/ui";
import { db } from "../../firebase";
import { addMonths, dayKey, monthStart, monthTitle, thisMonth, type YearMonth } from "../../lib/calendar";
import { watchMyPostsBetween, type Post } from "../../lib/posts";
import { useReadySession } from "../../session/SessionProvider";

/** My prayers, a month at a time, with a calendar to jump to any day. */
export default function PrayersScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const [month, setMonth] = useState<YearMonth>(() => thisMonth());
  const { posts, loaded } = useMonthPosts(profile.uid, month);
  const [selected, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Where each day's first prayer sits in the list, and where the list sits
  // below the calendar, to scroll to a day.
  const offsets = useRef(new Map<string, number>());
  const listY = useRef(0);

  const marked = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of posts) {
      const key = dayKey(p.createdAt);
      m.set(key, (m.get(key) ?? false) || !!p.answeredAt);
    }
    return m;
  }, [posts]);

  const now = thisMonth();
  const isThisMonth = month.year === now.year && month.month === now.month;

  function changeMonth(delta: number) {
    setSelected(null);
    offsets.current.clear();
    setMonth((m) => addMonths(m, delta));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function jumpTo(day: string) {
    setSelected(day);
    const y = offsets.current.get(day);
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, listY.current + y - 12), animated: true });
  }

  return (
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content}>
      <MonthCalendar
        month={month}
        marked={marked}
        selected={selected}
        onSelect={jumpTo}
        onChangeMonth={changeMonth}
        canGoForward={!isThisMonth}
      />
      {!isThisMonth && (
        <Pressable onPress={() => { setSelected(null); offsets.current.clear(); setMonth(thisMonth()); }} style={styles.backToNow} hitSlop={8}>
          <Text style={styles.backToNowText}>Back to this month</Text>
        </Pressable>
      )}
      <View style={styles.list} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
        {loaded && posts.length === 0 && (
          <Muted>{isThisMonth ? "Your prayers this month will appear here." : `No prayers in ${monthTitle(month)}.`}</Muted>
        )}
        {posts.map((post, i) => {
          const key = dayKey(post.createdAt);
          const firstOfDay = i === 0 || dayKey(posts[i - 1].createdAt) !== key;
          return (
            <View
              key={post.id}
              onLayout={firstOfDay ? (e) => { offsets.current.set(key, e.nativeEvent.layout.y); } : undefined}
            >
              <PostCard post={post} author={profile} footer={<OwnPostActions post={post} />} />
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function useMonthPosts(uid: string, month: YearMonth): { posts: Post[]; loaded: boolean } {
  const [state, setState] = useState<{ key: string; posts: Post[] } | null>(null);
  const { year, month: m } = month;
  const key = `${year}-${m}`;
  useEffect(() => {
    const from = monthStart({ year, month: m });
    const to = monthStart(addMonths({ year, month: m }, 1));
    const k = `${year}-${m}`;
    return watchMyPostsBetween(db, uid, from, to, (posts) => setState({ key: k, posts }), (err) => {
      console.warn("prayers for month failed", err);
      setState({ key: k, posts: [] });
    });
  }, [uid, year, m]);
  return state?.key === key ? { posts: state.posts, loaded: true } : { posts: [], loaded: false };
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  backToNow: { alignSelf: "center", paddingVertical: 10 },
  backToNowText: { fontSize: 16, fontFamily: fonts.serifSemiBold, color: colors.accent },
  list: { marginTop: 16 },
}));
