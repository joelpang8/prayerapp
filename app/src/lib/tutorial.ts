import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { RESPOND_WINDOW_MS } from "./posts";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type TutorialPage = { icon: IconName; title: string; body: string };

const minutes = RESPOND_WINDOW_MS / 60_000;

/**
 * "How PrayAlong works": three short pages, shown once right after someone
 * sets up their profile, and any time from Settings. Nothing is stored:
 * whether it was seen isn't remembered anywhere, on the phone or the server.
 */
export const TUTORIAL_PAGES: readonly TutorialPage[] = [
  {
    icon: "notifications-outline",
    title: "One moment a day",
    body:
      `Once a day, at a different time each day, everyone gets the same alert: "Time to pray." ` +
      `Take ${minutes} minutes to stop, pray, and share a photo and a few words, with the day's verse. ` +
      "Posting later is fine too; it's simply marked late.",
  },
  {
    icon: "people-outline",
    title: "Only your friends",
    body:
      "Your prayers are seen only by friends: people you've added who added you back. " +
      "Comments and reactions stay between friends too. " +
      "If you remove someone, they stop seeing your prayers straight away.",
  },
  {
    icon: "lock-closed-outline",
    title: "Some prayers are just for you",
    body:
      "Turn on Private when you post, and only you will ever see that prayer. " +
      "It stays in your Prayers tab, with no comments or reactions, and can't be shared later.",
  },
];

type Status = "loading" | "signedOut" | "needsProfile" | "ready";

/** True on the change from setting up a profile to signed in: a brand-new account. */
export function justFinishedProfile(previous: Status | null, now: Status): boolean {
  return previous === "needsProfile" && now === "ready";
}
