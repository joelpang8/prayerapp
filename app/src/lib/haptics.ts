import * as Haptics from "expo-haptics";

/**
 * Gentle haptics for a few moments that matter: a prayer reaching the
 * server (the "amen"), saving an edit or marking one answered, "I'll pray
 * for this", saving a verse. Never on scrolling or
 * typing. The phone's own setting (Sounds & Haptics > System Haptics) turns
 * them off; a failure is ignored.
 */
export const haptics = {
  /** "Amen": a soft double tap when a prayer has actually been posted (sent to the server). */
  amen: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}); }, 140);
  },
  /** An edit saved, or a prayer marked answered. */
  done: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  /** A small tap: "I'll pray for this", Save. */
  tap: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
};
