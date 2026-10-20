import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { t } from "../i18n";
import { RESPOND_WINDOW_MS } from "./posts";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type TutorialPage = { icon: IconName; title: string; body: string };

const minutes = RESPOND_WINDOW_MS / 60_000;

/**
 * "How PrayAlong works": three short pages, shown once right after someone
 * sets up their profile, and any time from Settings. Nothing is stored:
 * whether it was seen isn't remembered anywhere, on the phone or the server.
 * A function, so the pages are in the app's current language.
 */
export function tutorialPages(): readonly TutorialPage[] {
  return [
    { icon: "notifications-outline", title: t("intro.moment.title"), body: t("intro.moment.body", { minutes }) },
    { icon: "people-outline", title: t("intro.friends.title"), body: t("intro.friends.body") },
    { icon: "lock-closed-outline", title: t("intro.private.title"), body: t("intro.private.body") },
  ];
}

type Status = "loading" | "signedOut" | "needsProfile" | "ready";

/** True on the change from setting up a profile to signed in: a brand-new account. */
export function justFinishedProfile(previous: Status | null, now: Status): boolean {
  return previous === "needsProfile" && now === "ready";
}
