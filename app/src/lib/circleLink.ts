import * as Linking from "expo-linking";
import { Share } from "react-native";
import { t } from "../i18n";

/** The invite link for a circle: opens PrayAlong on "Ask to join" (prayerapp://circle-join/{code}). */
export function circleLinkUrl(code: string): string {
  return Linking.createURL(`circle-join/${code}`);
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
  const i = parts.indexOf("circle-join");
  const code = i >= 0 ? parts[i + 1] ?? "" : "";
  return /^[A-Za-z0-9]{20,40}$/.test(code) ? code : null;
}
