import * as Haptics from "expo-haptics";

/**
 * Gentle haptics for a few moments that matter: posting a prayer, marking
 * one answered, "I'll pray for this", saving a verse. Never on scrolling or
 * typing. The phone's own setting (Sounds & Haptics > System Haptics) turns
 * them off; a failure is ignored.
 */
export const haptics = {
  /** A prayer posted or marked answered. */
  done: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  /** A small tap: "I'll pray for this", Save. */
  tap: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
};
