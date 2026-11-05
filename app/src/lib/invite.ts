import * as Linking from "expo-linking";
import { Share } from "react-native";
import { normalizeUsername, usernameProblem } from "./profile";
import { t } from "../i18n";
import { WEB_URL } from "./webLinks";

/**
 * Invites: a link to a web page (firebase/hosting/join.html) whose "Open in
 * PrayAlong" button opens the inviter's profile in the app (with Add friend,
 * prayerapp://u/{username}), or says how to get the app; plus their
 * @username for anyone who needs to search instead. A web link is tappable
 * everywhere, unlike prayerapp:// in Messages.
 */
export function inviteLink(username: string): string {
  return `${WEB_URL}/u/${username}`;
}

export function inviteMessage(username: string): string {
  return t("invite.message", { username, link: inviteLink(username) });
}

export async function shareInvite(username: string): Promise<void> {
  await Share.share({ message: inviteMessage(username) });
}

/** The username in an invite link, or null if the URL isn't one. */
export function usernameFromLink(url: string | null): string | null {
  if (!url) return null;
  const { path, hostname } = Linking.parse(url);
  // prayerapp://u/name parses as hostname "u", path "name"; other forms as path "u/name".
  const parts = [hostname, ...(path ?? "").split("/")].filter((p): p is string => !!p);
  const i = parts.indexOf("u");
  const name = i >= 0 ? normalizeUsername(parts[i + 1] ?? "") : "";
  return name && !usernameProblem(name) ? name : null;
}
