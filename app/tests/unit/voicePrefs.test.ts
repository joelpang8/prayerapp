import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { englishVoices, parseVoicePrefs, SAMPLE_REF, speechOptions } = await import("../../src/lib/voicePrefs");

const v = (identifier: string, name: string, language: string, quality = "Default") => ({ identifier, name, language, quality });

describe("Listen voices", () => {
  const phone = [
    v("com.apple.voice.compact.en-US.Samantha", "Samantha", "en-US"),
    v("com.apple.voice.enhanced.en-GB.Daniel", "Daniel", "en-GB", "Enhanced"),
    v("com.apple.voice.premium.en-AU.Lee", "Lee", "en-AU", "Enhanced"),
    v("com.apple.speech.synthesis.voice.Bells", "Bells", "en-US"),
    v("com.apple.voice.compact.fr-FR.Thomas", "Thomas", "fr-FR"),
    v("com.apple.voice.compact.en-US.Samantha", "Samantha", "en-US"),
    v("com.apple.eloquence.en-GB-u-sd-gbsct.Flo", "Flo", "en-GB-u-sd-gbsct"),
  ];

  test("English voices only, best first, no novelty voices or duplicates", () => {
    expect(englishVoices(phone).map((c) => c.label)).toEqual([
      "Lee, Australian · Premium",
      "Daniel, British · Enhanced",
      "Flo, Scottish",
      "Samantha, American",
    ]);
  });

  test("speaks with the chosen voice and its accent, at the chosen speed", () => {
    const prefs = { voice: "com.apple.voice.enhanced.en-GB.Daniel", language: "en-GB", speed: "slower" as const };
    expect(speechOptions(prefs, new Set([prefs.voice]))).toEqual({ language: "en-GB", voice: prefs.voice, rate: 0.85 });
  });

  test("falls back to the phone's default English voice if the chosen one is gone", () => {
    const prefs = { voice: "com.apple.voice.premium.en-AU.Lee", language: "en-AU", speed: "normal" as const };
    expect(speechOptions(prefs, new Set(["something.else"]))).toEqual({ language: "en-US", rate: 1 });
    expect(speechOptions({ voice: null, language: null, speed: "faster" }, null)).toEqual({ language: "en-US", rate: 1.15 });
  });

  test("bad or missing saved preferences give the defaults", () => {
    expect(parseVoicePrefs(null)).toEqual({ voice: null, language: null, speed: "normal" });
    expect(parseVoicePrefs("{not json")).toEqual({ voice: null, language: null, speed: "normal" });
    expect(parseVoicePrefs(JSON.stringify({ voice: 3, speed: "warp" }))).toEqual({ voice: null, language: null, speed: "normal" });
  });

  test("the Settings sample is a verse, read through the same Listen path", () => {
    expect(SAMPLE_REF).toMatch(/^[1-3]?[A-Z]{2,3}\.\d+\.\d+$/);
    const settings = readFileSync("src/app/(tabs)/settings.tsx", "utf8");
    expect(settings).toContain("toggle(spokenPassage(passage), spokenLanguage(passage))");
    expect(settings).toContain('useVerseSpeech("settings-sample")');
  });
});
