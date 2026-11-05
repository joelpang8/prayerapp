import { Alert } from "react-native";
import { errorReason } from "./errors";

/**
 * Saves without waiting for the server. Firestore shows the change on this
 * phone at once and sends it when there's a connection, so with no signal
 * the screen doesn't sit spinning. If the server later refuses it, the
 * person is told why (and the change disappears from the screen).
 */
export function saveLater(write: Promise<unknown>, title: string, label: string): void {
  write.catch((err) => {
    console.warn(label, err);
    Alert.alert(title, errorReason(err));
  });
}
