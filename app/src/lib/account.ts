import AsyncStorage from "@react-native-async-storage/async-storage";
import { httpsCallable, type Functions } from "firebase/functions";
import { t } from "../i18n";

/**
 * "Delete my account". The server (firebase/functions, deleteAccount) does
 * the deleting, and only right after the person signed in again; this side
 * asks for that, calls it, then forgets this account on the phone.
 */
export const CONFIRM_WORD = "DELETE";

export const confirmed = (typed: string) => typed.trim().toUpperCase() === CONFIRM_WORD;

/** What's removed, shown before confirming. Must match accountDeletion.ts. */
export function whatIsDeleted(): string[] {
  return [
    t("account.item.prayers"),
    t("account.item.comments"),
    t("account.item.friends"),
    t("account.item.profile"),
    t("account.item.savedVerses"),
    t("account.item.settings"),
    t("account.item.signIn"),
  ];
}

/** This device's stored data for one account (e.g. its offline outbox), by key. */
export function keysForAccount(keys: readonly string[], uid: string): string[] {
  return keys.filter((k) => k.endsWith(`.${uid}`) || k.includes(`.${uid}.`));
}

export async function deleteAccountOnServer(functions: Functions): Promise<void> {
  await httpsCallable(functions, "deleteAccount")();
}

export async function forgetAccountOnDevice(uid: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const mine = keysForAccount(keys, uid);
  if (mine.length) await AsyncStorage.multiRemove(mine).catch(() => {});
}
