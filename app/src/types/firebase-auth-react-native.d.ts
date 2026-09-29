// firebase/auth's package typings point at the web build, which doesn't
// declare getReactNativePersistence. At runtime Metro resolves the React
// Native build (via the "react-native" export condition), which does.
import type { Persistence } from "firebase/auth";

declare module "firebase/auth" {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
