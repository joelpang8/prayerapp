/**
 * Links that open the app (the "Pray for" widget, Siri, invite links,
 * prayerapp://pray) arrive in a few shapes: "prayerapp://prayers",
 * "prayerapp:///prayers", or already a path. This turns them into an app
 * path, and anything the app doesn't have into Today ("/"), so a link never
 * lands on "Unmatched route". Pure, for tests.
 */
const KNOWN = new Set([
  "", "prayers", "friends", "circles", "profile", "pray", "compose", "activity", "post", "u", "read",
  "verse-card", "circle", "circle-members", "circle-join", "prayer-list", "settings", "edit-profile",
  "delete-account", "welcome", "onboarding", "sign-in",
]);

export function appPathFor(incoming: string): string {
  let rest = incoming.trim();
  // Drop the scheme (prayerapp:// or prayerapp:///) and any Expo dev "/--/" prefix.
  rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*?(?=[/?#]|$)/i, (m) => {
    const host = m.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    // prayerapp://prayers: the "host" is the first part of the path. A web
    // link (https://...web.app/...) keeps only its path.
    return /^https?:/i.test(m) ? "" : host ? `/${host}` : "";
  });
  rest = rest.replace(/^\/?--\//, "/");
  if (!rest.startsWith("/")) rest = `/${rest}`;
  const [pathPart, query = ""] = rest.split(/\?(.*)/s, 2);
  const path = pathPart.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const first = path.split("/")[1] ?? "";
  if (!KNOWN.has(first)) return "/";
  return query ? `${path}?${query}` : path;
}
