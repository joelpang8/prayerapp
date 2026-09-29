import { getApp } from "@react-native-firebase/app";
import { getMessaging, setBackgroundMessageHandler } from "@react-native-firebase/messaging";
import { registerRootComponent } from "expo";
import App from "./App";

// Must be registered outside React, before the app renders. For
// notification-type pushes iOS/Android show the alert themselves; this only
// runs for data handling while backgrounded, which the prototype just logs.
setBackgroundMessageHandler(getMessaging(getApp()), async (message) => {
  console.log("background push", message.messageId, message.data?.firedAt);
});

registerRootComponent(App);
