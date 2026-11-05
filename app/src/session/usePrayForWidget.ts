import { useEffect } from "react";
import { Platform } from "react-native";
import { t } from "../i18n";
import { widgetDays } from "../lib/prayForWidget";
import type { PrayForProps } from "../widgets/PrayForWidget";
import { useAppDay, usePrayerList } from "./usePrayerList";
import { useReadySession } from "./SessionProvider";

type WidgetApi = { updateTimeline: (e: { date: Date; props: PrayForProps }[]) => void; updateSnapshot: (p: PrayForProps) => void };

/** The widget, if this build has it (paid-team iPhone builds); never in tests or Expo Go. */
function widget(): WidgetApi | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("../widgets/PrayForWidget") as { default: WidgetApi }).default;
  } catch {
    return null;
  }
}

const emptyProps = (): PrayForProps => ({ title: t("widget.title"), name: "", more: "", empty: t("widget.open") });

/**
 * Keeps the "Pray for" widget up to date from my prayer list: today's first
 * name and how many more, then the next six days ahead. Cleared on sign-out.
 * Only names I typed into my own list; the widget's copy stays on this phone.
 */
export function usePrayForWidget(): void {
  const { profile } = useReadySession();
  const { items, loaded } = usePrayerList();
  const day = useAppDay();
  const key = JSON.stringify(items.map((i) => [i.id, i.name, i.often, i.answered ? 1 : 0, i.createdAt?.getTime() ?? 0]));
  useEffect(() => {
    const w = widget();
    if (!w || !loaded) return;
    try {
      const entries = widgetDays(items, new Date()).map((d) => ({
        date: d.date,
        props: {
          title: t("widget.title"),
          name: d.names[0] ?? "",
          more: d.names.length > 1 ? t("widget.more", { count: d.names.length - 1 }) : "",
          empty: items.length === 0 ? t("widget.startList") : t("widget.nobodyToday"),
        },
      }));
      w.updateTimeline(entries);
    } catch (err) {
      console.warn("widget update failed", err);
    }
    // items are covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded, day]);
  // Signing out (or switching account) clears it.
  useEffect(() => () => { try { widget()?.updateSnapshot(emptyProps()); } catch { /* not in this build */ } }, [profile.uid]);
}
