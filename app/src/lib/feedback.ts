import { t } from "../i18n";

/** Where feedback goes (the same address as in the privacy policy). */
export const FEEDBACK_EMAIL = "j.pang3248@gmail.com";

/**
 * The feedback email: only the app's version and build and the phone's
 * system version, to help find a problem. Nothing else about the person is
 * added; they see and can edit everything before sending.
 */
export function feedbackMail(info: { version: string | null; build: string | null; system: string }): string {
  const subject = t("feedback.subject");
  const body = `\n\n\n— ${t("feedback.details", { version: info.version ?? "?", build: info.build ?? "?", system: info.system })}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
