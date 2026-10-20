import { setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { VerseSpeaker } from "../lib/verseSpeech";
import { getVoicePrefs, speechOptions } from "../lib/voicePrefs";

/**
 * The app's one VerseSpeaker, on the phone's built-in voice.
 *
 * iOS audio: by default speech follows the silent switch (the app's audio
 * session is "solo ambient"). While a verse is being read, the session is
 * switched to "playback" so it's heard on silent, as in podcast apps, and
 * other audio pauses. Afterwards it goes back to "ambient" and other apps
 * are told they can resume.
 */
// The phone's voices, looked up once (null until then: any saved voice is tried).
let installed: Set<string> | null = null;
export function phoneVoices(): Promise<Speech.Voice[]> {
  return Speech.getAvailableVoicesAsync().then((voices) => {
    installed = new Set(voices.map((v) => v.identifier));
    return voices;
  });
}
void phoneVoices().catch(() => {});

/**
 * The voice from Settings when it speaks the verse's language (English for
 * the KJV, Spanish for the Reina-Valera); otherwise the phone's own voice
 * for that language. Always at the chosen speed.
 */
function voiceFor(lang: "en" | "es"): { language: string; voice?: string; rate: number } {
  const prefs = getVoicePrefs();
  const chosen = speechOptions(prefs, installed);
  const sameLanguage = !!chosen.voice && chosen.language.toLowerCase().startsWith(lang);
  if (sameLanguage) return chosen;
  return { language: lang === "es" ? "es-MX" : "en-US", rate: chosen.rate };
}

const speaker = new VerseSpeaker({
  // The voice and speed chosen in Settings (lib/voicePrefs.ts).
  speak: (text, cb, lang) => Speech.speak(text, { ...voiceFor(lang), useApplicationAudioSession: true, ...cb }),
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
export function useVerseSpeech(id: string | null): { speaking: boolean; toggle: (text: string, lang?: "en" | "es") => void } {
  const [current, setCurrent] = useState(speaker.speaking);
  useEffect(() => speaker.subscribe(setCurrent), []);
  useEffect(() => () => { if (id) void speaker.stopIf(id); }, [id]);
  const speaking = !!id && current === id;
  return {
    speaking,
    toggle: (text, lang = "en") => {
      if (!id) return;
      if (speaking) void speaker.stop();
      else void speaker.start(id, text, lang);
    },
  };
}
