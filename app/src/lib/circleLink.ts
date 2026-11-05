import * as Linking from "expo-linking";
import { Share } from "react-native";
import { t } from "../i18n";
import { WEB_URL } from "./webLinks";

/**
 * The invite link for a circle: a web page (firebase/hosting/join.html) that
 * opens PrayAlong on "Ask to join" (prayerapp://circle-join/{code}), or says
 * how to get the app.
 */
export function circleLinkUrl(code: string): string {
  return `${WEB_URL}/c/${code}`;
}

export async function shareCircleLink(name: string, code: string): Promise<void> {
  await Share.share({ message: t("circleLink.message", { name, link: circleLinkUrl(code) }) });
}

/** The code in a circle invite link, or null if the URL isn't one. */
export function circleCodeFromLink(url: string | null): string | null {
  if (!url) return null;
  const { path, hostname } = Linking.parse(url);
  // prayerapp://circle-join/CODE parses as hostname "circle-join", path "CODE".
  const parts = [hostname, ...(path ?? "").split("/")].filter((p): p is string => !!p);
  // The app link (circle-join) or the web page (/c/).
  const i = Math.max(parts.indexOf("circle-join"), parts.indexOf("c"));
  const code = i >= 0 ? parts[i + 1] ?? "" : "";
  return /^[A-Za-z0-9]{20,40}$/.test(code) ? code : null;
}
