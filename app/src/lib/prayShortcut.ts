/**
 * "Pray now" from outside the app: the app icon's long-press menu (a quick
 * action) and the link prayerapp://pray, which the Shortcuts app and Siri
 * can open. Both go to the /pray route, which opens the posting screen
 * while today's prompt is open and I haven't posted, and Today otherwise.
 * Nothing is scheduled or stored: it only decides where to go.
 */

/** How long a prompt can still be answered (late after the on-time window). Must match firestore.rules. */
export const OPEN_FOR_MS = 24 * 60 * 60 * 1000;

export const PRAY_LINK = "prayerapp://pray";

/** The icon's quick action. Shown always; /pray decides where it goes. */
export const PRAY_QUICK_ACTION_ID = "pray-now";

export function prayNowTarget(input: {
  prompt: { firedAt: Date } | null;
  /** I've posted for it, or a post is waiting to send. */
  posted: boolean;
  now: number;
}): "/compose" | "/" {
  const { prompt, posted, now } = input;
  return prompt && !posted && now - prompt.firedAt.getTime() < OPEN_FOR_MS ? "/compose" : "/";
}
