import { useEffect, useState } from "react";
import { db } from "../firebase";
import { t } from "../i18n";
import { appDayId } from "../lib/onThisDay";
import { loadPrayed, PRESET_GROUPS, savePrayed, watchPrayerList, type PrayerItem } from "../lib/prayerList";
import { useNow } from "./hooks";
import { useReadySession } from "./SessionProvider";

/** My prayer list, live. */
export function usePrayerList(): { items: PrayerItem[]; loaded: boolean } {
  const { profile } = useReadySession();
  const [state, setState] = useState<{ uid: string; items: PrayerItem[] } | null>(null);
  useEffect(
    () => watchPrayerList(db, profile.uid, (items) => setState({ uid: profile.uid, items }), (e) => {
      console.warn("prayer list failed", e);
      setState({ uid: profile.uid, items: [] });
    }),
    [profile.uid],
  );
  const mine = state?.uid === profile.uid ? state : null;
  return { items: mine?.items ?? [], loaded: !!mine };
}

/** The app's day (America/New_York), updated as it changes. */
export function useAppDay(): string {
  return appDayId(new Date(useNow(60_000)));
}

/** Which of today's ones I've marked prayed, on this phone; starts fresh each day. */
export function usePrayedToday(day: string): { prayed: ReadonlySet<string>; toggle: (id: string) => void } {
  const { profile } = useReadySession();
  const [state, setState] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const key = `${profile.uid}:${day}`;
  useEffect(() => {
    let live = true;
    void loadPrayed(profile.uid, day).then((ids) => { if (live) setState({ key, ids }); });
    return () => { live = false; };
  }, [profile.uid, day, key]);
  const ids = state.key === key ? state.ids : [];
  return {
    prayed: new Set(ids),
    toggle: (id) => {
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      setState({ key, ids: next });
      void savePrayed(profile.uid, day, next);
    },
  };
}

/** A group's name to show: the presets translated, my own as I wrote them. */
export function groupLabel(group: string): string {
  switch (group as (typeof PRESET_GROUPS)[number]) {
    case "family": return t("plist.group.family");
    case "friends": return t("plist.group.friends");
    case "church": return t("plist.group.church");
    case "world": return t("plist.group.world");
    default: return group;
  }
}
