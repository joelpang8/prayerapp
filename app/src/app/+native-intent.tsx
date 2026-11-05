import { appPathFor } from "../lib/deepLinks";

/**
 * Every link that opens the app passes through here first (expo-router):
 * the widget, Siri, notifications' links and invite links. Unknown links go
 * to Today instead of an "Unmatched route" screen.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return appPathFor(path);
  } catch {
    return "/";
  }
}
