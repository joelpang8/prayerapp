import { setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { VerseSpeaker } from "../lib/verseSpeech";

/**
 * The app's one VerseSpeaker, on the phone's built-in voice.
 *
 * iOS audio: by default speech follows the silent switch (the app's audio
 * session is "solo ambient"). While a verse is being read, the session is
 * switched to "playback" so it's heard on silent, as in podcast apps, and
 * other audio pauses. Afterwards it goes back to "ambient" and other apps
 * are told they can resume.
 */
const speaker = new VerseSpeaker({
  speak: (text, cb) => Speech.speak(text, { language: "en-US", useApplicationAudioSession: true, ...cb }),
  stop: () => Speech.stop(),
  beginAudio: () => setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: false, allowsRecording: false }),
  endAudio: async () => {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", shouldPlayInBackground: false, allowsRecording: false });
    await setIsAudioActiveAsync(false);
  },
});

// Leaving the foreground stops it. iOS also makes the app "inactive" for
// phone calls, Siri, alarms and Control Center, so audio that starts there
// stops the reading too.
AppState.addEventListener("change", (state) => {
  if (state !== "active") void speaker.stop();
});

/** Play/stop for one verse. Stops when the calling component goes away. */
export function useVerseSpeech(id: string | null): { speaking: boolean; toggle: (text: string) => void } {
  const [current, setCurrent] = useState(speaker.speaking);
  useEffect(() => speaker.subscribe(setCurrent), []);
  useEffect(() => () => { if (id) void speaker.stopIf(id); }, [id]);
  const speaking = !!id && current === id;
  return {
    speaking,
    toggle: (text) => {
      if (!id) return;
      if (speaking) void speaker.stop();
      else void speaker.start(id, text);
    },
  };
}
