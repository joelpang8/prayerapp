import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { MonthCalendar } from "../../components/MonthCalendar";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { SavedVerses } from "../../components/SavedVerses";
import { SelectField } from "../../components/SelectField";
import { Button, fonts, makeStyles, Muted, SectionTitle, Text, TextInput, useColors } from "../../components/ui";
import { db } from "../../firebase";
import { t, tn } from "../../i18n";
import { addMonths, monthTitle, type YearMonth } from "../../lib/calendar";
import {
  EMPTY_VERSE_INDEX, isFiltered, NO_FILTER, PAGE_SIZE, refsInBook, watchFilteredPosts, watchPostsOnDays, watchVerseIndex,
  type PrayerFilter, type VerseIndex,
} from "../../lib/myPrayers";
import { appDayId, onThisDayIds, yearsAgoText } from "../../lib/onThisDay";
import { appMonthOf, buildRecap, dayKeyOfPromptId, markedDays, prayersText, watchMyPostsInMonth } from "../../lib/monthRecap";
import { type Post } from "../../lib/posts";
import { matchesSearch, MIN_SEARCH, SEARCH_LIMIT } from "../../lib/prayerSearch";
import { BOOKS } from "../../lib/scripture/books";
import { bookName as nameOfBook, formatReference, parseRefId } from "../../lib/scripture/reference";
import { useNow } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";
import { usePullToRefresh } from "../../session/usePullToRefresh";

/**
 * My prayers: "On this day" from earlier years, a calendar to browse month
 * by month, and filters (answered, by verse) across all my prayers. Only
 * ever my own posts, private ones included; never a friend's.
 */
export default function PrayersScreen() {
  const styles = useStyles();
  const colors = useColors();
  const pull = usePullToRefresh();
  const { profile } = useReadySession();
  // The app's months (prompt days, America/New_York), like the recap.
  const [month, setMonth] = useState<YearMonth>(() => appMonthOf(new Date()));
  const { posts, loaded } = useMonthPosts(profile.uid, month);
  const [selected, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Where each day's first prayer sits in the list, and where the list sits
  // below the calendar, to scroll to a day.
  const offsets = useRef(new Map<string, number>());
  const listY = useRef(0);

  const marked = useMemo(() => markedDays(posts), [posts]);

  const now = appMonthOf(new Date());
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

  const [filter, setFilter] = useState<PrayerFilter>(NO_FILTER);
  // Search my prayers: replaces the tab's contents while there's a search.
  const [search, setSearch] = useState("");
  const searching = search.trim().length >= MIN_SEARCH;
  const filtered = isFiltered(filter);

  return (
    <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.accent} />}
    >
      <SearchBox value={search} onChange={setSearch} />
      {searching ? (
        <SearchResults uid={profile.uid} search={search} />
      ) : (
      <>
      <OnThisDay uid={profile.uid} />
      <SavedVerses />
      {loaded && <MonthInPrayer month={month} posts={posts} />}
      <MonthCalendar
        month={month}
        marked={marked}
        selected={selected}
        onSelect={jumpTo}
        onChangeMonth={changeMonth}
        canGoForward={!isThisMonth}
      />
      {!isThisMonth && (
        <Pressable onPress={() => { setSelected(null); offsets.current.clear(); setMonth(appMonthOf(new Date())); }} style={styles.backToNow} hitSlop={8}>
          <Text style={styles.backToNowText}>{t("prayers.backToThisMonth")}</Text>
        </Pressable>
      )}
      <Filters uid={profile.uid} filter={filter} onChange={setFilter} />
      {filtered ? (
        <FilteredList uid={profile.uid} filter={filter} />
      ) : (
      <View style={styles.list} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
        {loaded && posts.length === 0 && (
          isThisMonth
            ? <EmptyState icon="book-outline" title={t("prayers.emptyThisMonth.title")} message={t("prayers.emptyThisMonth.message")} />
            : <EmptyState icon="book-outline" title={monthTitle(month)} message={t("prayers.emptyMonth.message")} />
        )}
        {posts.map((post, i) => {
          const key = dayKeyOfPromptId(post.promptId);
          const firstOfDay = i === 0 || dayKeyOfPromptId(posts[i - 1].promptId) !== key;
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
      )}
      </>
      )}
    </ScrollView>
  );
}

/** My posts from this day in earlier years, at the top when there are any. */
function OnThisDay({ uid }: { uid: string }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  // The app's day (America/New_York, like prompt ids); re-checked each minute
  // so the card changes at midnight while the app is open.
  const today = appDayId(new Date(useNow(60_000)));
  const [state, setState] = useState<{ day: string; posts: Post[] } | null>(null);
  useEffect(() => watchPostsOnDays(db, uid, onThisDayIds(today), (posts) => setState({ day: today, posts }), (err) => {
    console.warn("on this day failed", err);
    setState({ day: today, posts: [] });
  }), [uid, today]);
  const posts = state?.day === today ? state.posts : [];
  if (posts.length === 0) return null;
  return (
    <View style={styles.onThisDay}>
      <Text style={styles.onThisDayTitle} accessibilityRole="header">{t("prayers.onThisDay")}</Text>
      {posts.map((post) => (
        <View key={post.id} style={styles.onThisDayItem}>
          <Text style={styles.yearsAgo}>{yearsAgoText(today, post.promptId)}</Text>
          <PostCard post={post} author={profile} footer={<OwnPostActions post={post} />} />
        </View>
      ))}
    </View>
  );
}

const bookName = (code: string) => nameOfBook(code);
function refLabel(id: string): string {
  try {
    return formatReference(parseRefId(id));
  } catch {
    return id;
  }
}

function describeFilter(f: PrayerFilter): string {
  const verse = f.ref ? t("prayers.filter.withRef", { ref: refLabel(f.ref) }) : f.book ? t("prayers.filter.withBook", { book: bookName(f.book) }) : "";
  return t(f.show === "answered" ? "prayers.filter.describeAnswered" : "prayers.filter.describeAll", { verse });
}

/** All / Answered, and a verse filter from the books and verses I've actually prayed with. */
function Filters({ uid, filter, onChange }: { uid: string; filter: PrayerFilter; onChange: (f: PrayerFilter) => void }) {
  const styles = useStyles();
  const [index, setIndex] = useState<VerseIndex>(EMPTY_VERSE_INDEX);
  useEffect(() => watchVerseIndex(db, uid, setIndex, (err) => console.warn("verse index failed", err)), [uid]);
  const books = Object.entries(index.books).sort(([a], [b]) => (bookOrder(a) - bookOrder(b)));
  const refs = filter.book ? refsInBook(index, filter.book) : [];
  const chip = (show: PrayerFilter["show"], label: string, a11y: string) => {
    const selected = filter.show === show;
    return (
      <Pressable
        onPress={() => onChange({ ...filter, show })}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={a11y}
        style={[styles.chip, selected && styles.chipOn]}
        hitSlop={4}
      >
        <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.filters}>
      <SectionTitle>{t("prayers.filter.title")}</SectionTitle>
      <View style={styles.chips}>
        {chip("all", t("prayers.filter.all"), t("prayers.filter.allA11y"))}
        {chip("answered", t("prayers.filter.answered"), t("prayers.filter.answeredA11y"))}
      </View>
      {books.length > 0 ? (
        <>
          <SelectField
            title={t("prayers.filter.verseBook")}
            placeholder={t("prayers.filter.anyVerse")}
            noneLabel={t("prayers.filter.anyVerse")}
            value={filter.book ?? ""}
            onChange={(b) => onChange({ ...filter, book: b || null, ref: null })}
            options={books.map(([code, n]) => ({ value: code, label: `${bookName(code)} (${n})` }))}
          />
          {filter.book && refs.length > 1 && (
            <SelectField
              title={t("prayers.filter.versesIn", { book: bookName(filter.book) })}
              placeholder={t("prayers.filter.anyVerseIn", { book: bookName(filter.book) })}
              noneLabel={t("prayers.filter.anyVerseIn", { book: bookName(filter.book) })}
              value={filter.ref ?? ""}
              onChange={(r) => onChange({ ...filter, ref: r || null })}
              options={refs.map((r) => ({ value: r.id, label: `${refLabel(r.id)} (${r.count})` }))}
            />
          )}
        </>
      ) : (
        <Muted>{t("prayers.filter.noVerses")}</Muted>
      )}
      {isFiltered(filter) && (
        <Pressable onPress={() => onChange(NO_FILTER)} accessibilityRole="button" style={styles.clear} hitSlop={8}>
          <Text style={styles.backToNowText}>{t("prayers.filter.clear")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const BOOK_ORDER = new Map<string, number>();
function bookOrder(code: string): number {
  if (!BOOK_ORDER.size) {
    // BOOKS is in Bible order.
    let i = 0;
    for (const b of BOOKS) BOOK_ORDER.set(b.id, i++);
  }
  return BOOK_ORDER.get(code) ?? 999;
}

/** "Search my prayers": words in my notes, answered notes, places or verses. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t("prayers.search.placeholder")}
        accessibilityLabel={t("prayers.search.label")}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.searchInput}
      />
    </View>
  );
}

/** My posts matching the search, newest first, PAGE_SIZE at a time. */
function SearchResults({ uid, search }: { uid: string; search: string }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  const [all, setAll] = useState<{ posts: Post[]; capped: boolean } | null>(null);
  // Same query as the unfiltered list (authorId == me), so no new index.
  useEffect(() => watchFilteredPosts(db, uid, NO_FILTER, SEARCH_LIMIT, (page) => setAll({ posts: page.posts, capped: page.hasMore }), (err) => {
    console.warn("search failed", err);
    setAll({ posts: [], capped: false });
  }), [uid]);
  const [shown, setShown] = useState({ search, n: PAGE_SIZE });
  const n = shown.search === search ? shown.n : PAGE_SIZE;
  if (!all) return <View style={styles.list}><Muted>{t("prayers.search.loading")}</Muted></View>;
  const found = all.posts.filter((p) => matchesSearch(p, search));
  return (
    <View style={styles.list}>
      <Muted>{tn("prayers.search.found", found.length)}</Muted>
      {found.length === 0 && <EmptyState icon="search-outline" title={t("prayers.search.none.title")} message={t("prayers.search.none.message")} />}
      {found.slice(0, n).map((post) => (
        <PostCard key={post.id} post={post} author={profile} footer={<OwnPostActions post={post} />} />
      ))}
      {found.length > n && (
        <Button title={t("prayers.showMore")} kind="secondary" onPress={() => setShown({ search, n: n + PAGE_SIZE })} />
      )}
      {all.capped && <Muted>{t("prayers.search.capped", { count: SEARCH_LIMIT })}</Muted>}
    </View>
  );
}

/** The filtered prayers, PAGE_SIZE at a time. */
function FilteredList({ uid, filter }: { uid: string; filter: PrayerFilter }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  const key = JSON.stringify(filter);
  const [max, setMax] = useState({ key, n: PAGE_SIZE });
  const n = max.key === key ? max.n : PAGE_SIZE;
  const [state, setState] = useState<{ key: string; n: number; posts: Post[]; hasMore: boolean } | null>(null);
  useEffect(() => watchFilteredPosts(db, uid, JSON.parse(key) as PrayerFilter, n, (page) => setState({ key, n, ...page }), (err) => {
    console.warn("filtered prayers failed", err);
    setState({ key, n, posts: [], hasMore: false });
  }), [uid, key, n]);
  // While a bigger page loads, keep showing the current one.
  const current = state?.key === key ? state : null;
  return (
    <View style={styles.list}>
      <Muted>{describeFilter(filter)}</Muted>
      {current && current.posts.length === 0 && <EmptyState icon="search-outline" title={t("prayers.filter.noMatch.title")} message={t("prayers.filter.noMatch.message")} />}
      {current?.posts.map((post) => (
        <PostCard key={post.id} post={post} author={profile} footer={<OwnPostActions post={post} />} />
      ))}
      {current?.hasMore && (
        <Button
          title={t("prayers.showMore")}
          kind="secondary"
          busy={current.n !== n}
          onPress={() => setMax({ key, n: n + PAGE_SIZE })}
        />
      )}
    </View>
  );
}

function useMonthPosts(uid: string, month: YearMonth): { posts: Post[]; loaded: boolean } {
  const [state, setState] = useState<{ key: string; posts: Post[] } | null>(null);
  const { year, month: m } = month;
  const key = `${year}-${m}`;
  useEffect(() => {
    const k = `${year}-${m}`;
    return watchMyPostsInMonth(db, uid, { year, month: m }, (posts) => setState({ key: k, posts }), (err) => {
      console.warn("prayers for month failed", err);
      setState({ key: k, posts: [] });
    });
  }, [uid, year, m]);
  return state?.key === key ? { posts: state.posts, loaded: true } : { posts: [], loaded: false };
}

/**
 * "Your month in prayer": counts only, from my own posts in the month the
 * calendar shows. No streaks, goals or comparisons, and nothing at all for
 * a month without prayers. Worked out on the phone; nothing is stored.
 */
function MonthInPrayer({ month, posts }: { month: YearMonth; posts: Post[] }) {
  const styles = useStyles();
  const { profile } = useReadySession();
  const recap = buildRecap(profile.uid, posts);
  if (recap.posted === 0) return null;
  const name = monthTitle(month);
  const lines = [
    t("prayers.recap.posted", { prayers: prayersText(recap.posted) }),
    recap.answered > 0 ? tn("prayers.recap.answered", recap.answered) : "",
  ].filter(Boolean);
  const verses = recap.verses.map(refLabel);
  const label = [t("prayers.recap.a11y", { month: name }), ...lines, verses.length ? t("prayers.recap.versesA11y", { list: verses.join(", ") }) : ""];
  return (
    <View style={styles.recap} accessible accessibilityLabel={label.filter(Boolean).join(" ")}>
      <Text style={styles.recapTitle} accessibilityRole="header">{t("prayers.recap.title", { month: name })}</Text>
      {lines.map((l) => <Text key={l} style={styles.recapLine}>{l}</Text>)}
      {verses.length > 0 && (
        <Text style={styles.recapVerses}>
          {tn("prayers.recap.verses", verses.length, { list: verses.join(" · ") })}
        </Text>
      )}
      <Muted>{t("prayers.recap.onlyYou")}</Muted>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 44, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 10 },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  backToNow: { alignSelf: "center", paddingVertical: 10 },
  backToNowText: { fontSize: 16, fontFamily: fonts.serifSemiBold, color: colors.accent },
  list: { marginTop: 16, gap: 8 },
  recap: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6, marginBottom: 16 },
  recapTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  recapLine: { fontSize: 17, lineHeight: 24, color: colors.text },
  recapVerses: { fontSize: 16, lineHeight: 23, color: colors.accent, fontFamily: fonts.display },
  onThisDay: { marginBottom: 20, gap: 8 },
  onThisDayTitle: { fontSize: 24, fontFamily: fonts.display, color: colors.text },
  onThisDayItem: { gap: 4 },
  yearsAgo: { fontSize: 15, fontFamily: fonts.serifSemiBold, color: colors.accent },
  filters: { marginTop: 16, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 16, color: colors.text },
  chipTextOn: { color: colors.accent, fontFamily: fonts.serifSemiBold },
  clear: { alignSelf: "flex-start", paddingVertical: 6 },
}));
