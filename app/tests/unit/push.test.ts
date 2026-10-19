import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { remotePush: false } } } }));

describe("daily prompt push (app side)", () => {
  test("subscribes to the same topic the server sends to", async () => {
    const { PROMPT_TOPIC } = await import("../../src/lib/push");
    const server = readFileSync(new URL("../../../firebase/functions/src/dailyPrompt.ts", import.meta.url), "utf8");
    expect(server).toContain(`PROMPT_TOPIC = "${PROMPT_TOPIC}"`);
  });

  test("builds without push (the Simulator) never load React Native Firebase", async () => {
    const { pushAvailable, setPromptSubscription } = await import("../../src/lib/push");
    expect(pushAvailable()).toBe(false);
    await expect(setPromptSubscription(true)).resolves.toBeUndefined();
    await expect(setPromptSubscription(false)).resolves.toBeUndefined();
  });

  test("its native code is linked only into push builds", () => {
    const config = readFileSync(new URL("../../react-native.config.js", import.meta.url), "utf8");
    expect(config).toMatch(/REMOTE_PUSH === "1"/);
    expect(config).toContain("@react-native-firebase/messaging");
  });
});
