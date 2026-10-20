import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { t } from "../i18n";

/**
 * In-app text size, on top of the phone's own larger-text setting (which
 * the app also follows). A display preference kept on the device.
 */
export type TextSize = "standard" | "large" | "larger";
export const TEXT_SIZES: { id: TextSize; label: string; scale: number }[] = [
  { id: "standard", get label() { return t("textSize.standard"); }, scale: 1 },
  { id: "large", get label() { return t("textSize.large"); }, scale: 1.15 },
  { id: "larger", get label() { return t("textSize.larger"); }, scale: 1.3 },
];

const KEY = "ui.textSize";
let current: TextSize = "standard";
const listeners = new Set<() => void>();
const isSize = (v: unknown): v is TextSize => TEXT_SIZES.some((t) => t.id === v);

export async function loadTextSize(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (isSize(saved)) current = saved;
  } catch {
    // Keep the standard size.
  }
  for (const l of listeners) l();
}

export function setTextSize(size: TextSize): void {
  current = size;
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, size).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, () => current);
}

export function useTextScale(): number {
  const size = useTextSize();
  return TEXT_SIZES.find((t) => t.id === size)!.scale;
}
