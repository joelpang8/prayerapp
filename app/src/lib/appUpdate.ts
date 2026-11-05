/**
 * "A new version is ready": the newest TestFlight build is set by hand in
 * the Firebase console (config/app: latestBuild, and optionally
 * minimumBuild for when an older build would no longer work with the
 * server). The app compares it with its own build number. Pure, for tests.
 */
export type UpdateState = "none" | "available" | "required";

export function updateState(myBuild: string | null, config: { latestBuild?: unknown; minimumBuild?: unknown } | undefined): UpdateState {
  const mine = Number(myBuild);
  if (!myBuild || !Number.isInteger(mine) || !config) return "none";
  const latest = typeof config.latestBuild === "number" ? config.latestBuild : 0;
  const minimum = typeof config.minimumBuild === "number" ? config.minimumBuild : 0;
  if (mine < minimum) return "required";
  if (mine < latest) return "available";
  return "none";
}

/** Opens TestFlight (where testers update), or its web page. */
export const TESTFLIGHT_URL = "itms-beta://";
export const TESTFLIGHT_WEB = "https://testflight.apple.com";
