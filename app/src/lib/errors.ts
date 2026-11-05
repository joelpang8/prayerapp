import { t } from "../i18n";

/**
 * A plain-language reason for a failed save or load, from the Firebase error
 * code, with the code itself at the end so a tester can report it. Used where
 * the reason can't reveal anything about someone else (never for friend
 * requests or profiles, so a block stays secret).
 */
export function errorReason(err: unknown): string {
  const code = errorCode(err);
  const reason =
    code === "permission-denied" || code === "storage/unauthorized" ? t("errors.denied")
    : code === "unavailable" || code === "deadline-exceeded" || code === "storage/retry-limit-exceeded" || code === "auth/network-request-failed" ? t("errors.offline")
    : code === "not-found" || code === "storage/object-not-found" ? t("errors.gone")
    : code === "unauthenticated" || code === "storage/unauthenticated" ? t("errors.signIn")
    : code === "resource-exhausted" || code === "storage/quota-exceeded" ? t("errors.busy")
    : code === "photo-missing" ? t("errors.photoMissing")
    : t("errors.other");
  return code ? `${reason}\n\n${t("errors.code", { code })}` : reason;
}

/** The error's code ("permission-denied", "storage/unauthorized"), without Firebase's "firestore/" prefix. */
export function errorCode(err: unknown): string | null {
  const raw = (err as { code?: unknown } | null)?.code;
  if (typeof raw !== "string" || !raw) return null;
  return raw.replace(/^firestore\//, "");
}
