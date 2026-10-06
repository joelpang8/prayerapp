import { describe, expect, test, vi } from "vitest";

// expo-notifications is native; only the permission mapping is tested here.
vi.mock("expo-notifications", () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
}));
vi.mock("react-native", () => ({ AppState: {}, Linking: {}, Platform: { OS: "ios" } }));
const { statusFrom } = await import("../../src/lib/notifications");

describe("notification permission status", () => {
  test("granted", () => {
    expect(statusFrom({ granted: true, canAskAgain: true, ios: { status: 2 } as never })).toBe("granted");
  });

  test("iOS quiet (provisional) delivery counts as on", () => {
    expect(statusFrom({ granted: false, canAskAgain: true, ios: { status: 3 } as never })).toBe("granted");
  });

  test("never asked: offer the button", () => {
    expect(statusFrom({ granted: false, canAskAgain: true, ios: { status: 0 } as never })).toBe("undetermined");
    expect(statusFrom({ granted: false, canAskAgain: true })).toBe("undetermined"); // Android before asking
  });

  test("refused: only the phone's Settings can change it", () => {
    expect(statusFrom({ granted: false, canAskAgain: false, ios: { status: 1 } as never })).toBe("denied");
    expect(statusFrom({ granted: false, canAskAgain: false })).toBe("denied");
  });
});
