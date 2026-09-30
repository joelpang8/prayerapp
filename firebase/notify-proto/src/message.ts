/**
 * The push for a prompt. Everyone is subscribed to one FCM topic, so a
 * single send reaches every device and no per-user push token is stored.
 */
import type { TopicMessage } from "firebase-admin/messaging";

export const WINDOW_MS = 2 * 60 * 1000; // respond "right now"
export const GRACE_MS = 5 * 60 * 1000; // still on time
/** After this the push is stale: posting is still allowed (late) for 24h,
 *  but a "pray now" alert hours later is noise, so it's dropped. */
export const PUSH_TTL_MS = 60 * 60 * 1000;

export function buildPromptMessage(opts: { topic: string; promptId: string; firedAt: Date; verseRef?: string | null }): TopicMessage {
  const firedAtIso = opts.firedAt.toISOString();
  const expiresAt = Math.floor((opts.firedAt.getTime() + PUSH_TTL_MS) / 1000);
  return {
    topic: opts.topic,
    notification: {
      title: "Time to pray",
      body: "Pause and pray right now. You have 2 minutes.",
    },
    // Data travels with the alert so the app can start the countdown from
    // the server's firedAt, not from whenever the push happened to arrive.
    data: {
      kind: "prompt",
      promptId: opts.promptId,
      firedAt: firedAtIso,
      windowMs: String(WINDOW_MS),
      graceMs: String(GRACE_MS),
      ...(opts.verseRef ? { verseRef: opts.verseRef } : {}),
    },
    apns: {
      headers: {
        "apns-priority": "10", // deliver immediately
        "apns-push-type": "alert",
        "apns-expiration": String(expiresAt),
        "apns-collapse-id": `prompt-${opts.promptId}`,
      },
      payload: {
        aps: {
          sound: "default",
          // Breaks through Focus / scheduled summaries if the user allows
          // Time Sensitive notifications for the app.
          "interruption-level": "time-sensitive",
        },
      },
    },
    android: {
      priority: "high",
      ttl: PUSH_TTL_MS,
      collapseKey: `prompt-${opts.promptId}`,
      // No channelId: the prototype app doesn't create channels, so Android
      // uses its default one. Integration creates a high-importance "prompt"
      // channel and names it here.
      notification: { tag: `prompt-${opts.promptId}` },
    },
  };
}
