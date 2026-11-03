import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { t } from "../i18n";
import { localWeeklyTrigger } from "../lib/circleTime";
import { circleReminderId, loadCircleReminders, useCircleReminderIds } from "../lib/circleReminders";
import type { Circle } from "../lib/circles";
import { useReadySession } from "./SessionProvider";

// Changes run one after another, so a sign-out's cancel can't land after
// (and undo) the next account's scheduling.
let queue: Promise<void> = Promise.resolve();
const serially = (fn: () => Promise<void>) => { queue = queue.then(fn, fn); };

/** Cancels every weekly circle reminder scheduled on this phone. */
async function cancelCircleReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) {
    if (n.identifier.startsWith("circle-")) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }
}

/**
 * Keeps this phone's weekly circle reminders in step: one for each circle
 * I'm in that has a prayer time and that I've turned reminders on for, in
 * my phone's time; anything else is cancelled. Runs when the app opens and
 * whenever circles or choices change.
 */
export function useCircleReminders(circles: readonly Circle[], loaded: boolean): void {
  const { profile } = useReadySession();
  const on = useCircleReminderIds(profile.uid);
  useEffect(() => {
    void loadCircleReminders(profile.uid);
    // Signing out (or leaving this account) stops this account's reminders.
    return () => serially(cancelCircleReminders);
  }, [profile.uid]);
  const plan = JSON.stringify(
    circles.filter((c) => c.prayerTime && on.has(c.id)).map((c) => ({ id: c.id, name: c.name, time: c.prayerTime })),
  );
  useEffect(() => {
    if (!loaded) return;
    const wanted = JSON.parse(plan) as { id: string; name: string; time: NonNullable<Circle["prayerTime"]> }[];
    serially(async () => {
      await cancelCircleReminders();
      for (const c of wanted) {
        const when = localWeeklyTrigger(c.time, new Date());
        await Notifications.scheduleNotificationAsync({
          identifier: circleReminderId(c.id),
          content: { title: t("circleTime.reminderTitle", { name: c.name }), body: t("circleTime.reminderBody"), data: { kind: "circle", circleId: c.id } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...when },
        }).catch((err) => console.warn("circle reminder failed", err));
      }
    });
  }, [plan, loaded]);
}
