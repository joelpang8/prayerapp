import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { t } from "../i18n";
import { planReminder, REMINDER_ID, useReminderEnabled } from "../lib/reminder";
import { useLatestPrompt, useMyPosts, useOutbox } from "./hooks";

/** Schedules or cancels the opt-in reminder (lib/reminder.ts) as things change. */
export function useReminder(): void {
  const enabled = useReminderEnabled();
  const { prompt } = useLatestPrompt();
  const { posts, loaded } = useMyPosts();
  const { items: queued } = useOutbox();
  const posted = !!prompt && (posts.some((p) => p.promptId === prompt.id) || queued.some((q) => q.prompt.id === prompt.id));

  useEffect(() => {
    if (!loaded) return;
    const plan = planReminder({ enabled, prompt, posted, now: Date.now() });
    // One reminder at most: replace whatever was scheduled before.
    void Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {}).then(() => {
      if (plan.kind !== "schedule") return;
      return Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content: { title: t("reminder.title"), body: t("reminder.body"), data: { kind: "reminder", promptId: plan.promptId } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.at) },
      }).then(() => {}, (err) => console.warn("reminder failed", err));
    });
  }, [enabled, prompt, posted, loaded]);
}
