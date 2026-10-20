import { readFileSync, statSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

const { nextCheckIn, planLiveActivity } = await import("../../src/lib/liveActivity");

const firedAt = new Date("2026-10-20T18:14:00Z");
const prompt = { id: "20261020", firedAt };
const at = (min: number) => firedAt.getTime() + min * 60_000;
const base = { enabled: true, prompt, posted: false, running: null, now: at(0.5) };

describe("lock screen countdown", () => {
  test("starts while the prompt is on time and I haven't posted: a 2-minute countdown, on time until +7", () => {
    expect(planLiveActivity(base)).toEqual({ kind: "start", promptId: "20261020", countdownTo: at(2), onTimeUntil: at(7), stop: null });
    expect(planLiveActivity({ ...base, now: at(6.9) }).kind).toBe("start");
  });

  test("only one per prompt, even after the app restarts", () => {
    expect(planLiveActivity({ ...base, running: { promptId: "20261020", activityId: "a1" } })).toEqual({ kind: "keep" });
  });

  test("a new day's prompt replaces yesterday's", () => {
    const old = { promptId: "20261019", activityId: "a0" };
    expect(planLiveActivity({ ...base, running: old })).toMatchObject({ kind: "start", stop: old });
  });

  test("ends when I post, when the window is over, or when it's turned off", () => {
    const running = { promptId: "20261020", activityId: "a1" };
    expect(planLiveActivity({ ...base, running, posted: true })).toEqual({ kind: "stop", stop: running });
    expect(planLiveActivity({ ...base, running, now: at(7) })).toEqual({ kind: "stop", stop: running });
    expect(planLiveActivity({ ...base, running, enabled: false })).toEqual({ kind: "stop", stop: running });
  });

  test("never starts late, after posting, without a prompt, or when off", () => {
    expect(planLiveActivity({ ...base, now: at(7) })).toEqual({ kind: "none" });
    expect(planLiveActivity({ ...base, posted: true })).toEqual({ kind: "none" });
    expect(planLiveActivity({ ...base, prompt: null })).toEqual({ kind: "none" });
    expect(planLiveActivity({ ...base, enabled: false })).toEqual({ kind: "none" });
  });

  test("checks again at the end of the window while the app is open", () => {
    expect(nextCheckIn(prompt, at(1))).toBe(6 * 60_000);
    expect(nextCheckIn(prompt, at(8))).toBeNull();
    expect(nextCheckIn(null, at(1))).toBeNull();
  });

  test("started on the phone only: no push tokens asked for or kept", () => {
    const config = readFileSync("app.config.ts", "utf8");
    expect(config).toMatch(/\n\s*"expo-live-activity",\n/);
    expect(config).not.toMatch(/enablePushNotifications\s*:/);
    expect(config.indexOf('"./plugins/withTeamForAllTargets"')).toBeLessThan(config.indexOf('"expo-live-activity"'));
    const hook = readFileSync("src/session/useLiveActivity.ts", "utf8");
    expect(hook).not.toMatch(/TokenListener|PushToStart/);
  });

  test("its image fits iOS's 4 KB limit", () => {
    expect(statSync("assets/liveActivity/candle.png").size).toBeLessThanOrEqual(4096);
  });
});
