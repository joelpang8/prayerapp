import * as Linking from "expo-linking";
import { Share } from "react-native";
import { normalizeUsername, usernameProblem } from "./profile";

/**
 * Invites: a link that opens the inviter's profile in the app (with Add
 * friend), plus their @username for anyone who needs to search instead.
 * The link uses the app's own scheme (prayerapp://), so it opens the app
 * once it's installed; a web link that also works without the app needs a
 * website and the paid Apple account (Universal Links), so it comes later.
 */
export function inviteLink(username: string): string {
  return Linking.createURL(`u/${username}`);
}

export function inviteMessage(username: string): string {
  return `Pray with me on Pray Now 🙏\nAdd me as a friend: @${username}\n${inviteLink(username)}`;
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
