import type { TopicMessage } from "firebase-admin/messaging";

/**
 * Opt-in notifications about my own things: a friend praying for one of my
 * requests, reacting to my prayer, or commenting on it. Each kind is off
 * until I turn it on (users/{me}/private/notify). Sent to my secret topic,
 * which only my phone listens on; no push tokens are stored. Messages name
 * the friend (they're already my friend and can see this anyway).
 */

export type ActivityKind = "taps" | "reactions" | "comments";
export type NotifyPrefs = { topic: string; taps: boolean; reactions: boolean; comments: boolean; lang: "en" | "es" };

export const TOPIC_PATTERN = /^n_[A-Za-z0-9]{32}$/;

/** The saved settings, or null if missing or malformed. */
export function parseNotifyPrefs(d: Record<string, unknown> | undefined): NotifyPrefs | null {
  if (!d || typeof d.topic !== "string" || !TOPIC_PATTERN.test(d.topic)) return null;
  return {
    topic: d.topic,
    taps: d.taps === true,
    reactions: d.reactions === true,
    comments: d.comments === true,
    lang: d.lang === "es" ? "es" : "en",
  };
}

/** Whether to tell `owner` about `actor` doing `kind`: opted in, and never about themselves. */
export function shouldNotify(prefs: NotifyPrefs | null, kind: ActivityKind, owner: string, actor: string): prefs is NotifyPrefs {
  return !!prefs && prefs[kind] && owner !== actor;
}

const EMOJI: Record<string, string> = { praying: "🙏", love: "❤️", happy: "😊", amen: "🙌", cool: "😎", hug: "🤗" };

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const WORDING = {
  en: {
    tapTitle: (name: string) => `🙏 ${name} is praying for you`,
    tapBody: (request: string) => (request ? `For: “${request}”` : "For one of your prayer requests"),
    reactionTitle: (name: string, emoji: string) => `${emoji} ${name} reacted to your prayer`,
    commentTitle: (name: string) => `💬 ${name} commented on your prayer`,
  },
  es: {
    tapTitle: (name: string) => `🙏 ${name} está orando por ti`,
    tapBody: (request: string) => (request ? `Por: “${request}”` : "Por una de tus peticiones de oración"),
    reactionTitle: (name: string, emoji: string) => `${emoji} ${name} reaccionó a tu oración`,
    commentTitle: (name: string) => `💬 ${name} comentó tu oración`,
  },
};

export function buildActivityMessage(
  prefs: NotifyPrefs,
  e:
    | { kind: "taps"; name: string; requestText: string }
    | { kind: "reactions"; name: string; reaction: string; postId: string; notes: string }
    | { kind: "comments"; name: string; text: string; postId: string },
): TopicMessage {
  const w = WORDING[prefs.lang];
  const name = clip(e.name, 40);
  const notification =
    e.kind === "taps"
      ? { title: w.tapTitle(name), body: w.tapBody(clip(e.requestText, 80)) }
      : e.kind === "reactions"
        ? { title: w.reactionTitle(name, EMOJI[e.reaction] ?? "🙏"), body: clip(e.notes, 100) }
        : { title: w.commentTitle(name), body: `“${clip(e.text, 120)}”` };
  return {
    topic: prefs.topic,
    notification,
    // Tapping opens the post (reactions, comments) or my profile (prayer requests).
    data: { kind: "activity", activity: e.kind, ...(e.kind === "taps" ? {} : { postId: e.postId }) },
    apns: { payload: { aps: { sound: "default", "thread-id": "activity" } } },
    android: { notification: { channelId: "activity" } },
  };
}
