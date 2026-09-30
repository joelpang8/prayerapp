import { describe, expect, test } from "vitest";
import { EMULATOR_BUCKET, FirebaseConfigError, resolveFirebaseConfig } from "../../src/lib/firebaseConfig";

// What app/.env looks like straight after `cp .env.example .env`: keys present, values empty.
const fromExample = {
  apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "",
};

describe("emulator mode", () => {
  test("empty values from .env.example don't produce an empty API key (auth/invalid-api-key)", () => {
    const r = resolveFirebaseConfig({ ...fromExample, useEmulators: "1" });
    expect(r.usingEmulators).toBe(true);
    expect(r.options.apiKey).toBeTruthy();
    expect(r.options).toMatchObject({ projectId: "demo-prayerapp", storageBucket: EMULATOR_BUCKET });
    expect(r.emulatorHost).toBe("127.0.0.1");
  });

  test("an empty or whitespace emulator host falls back to localhost", () => {
    expect(resolveFirebaseConfig({ useEmulators: "1", emulatorHost: " " }).emulatorHost).toBe("127.0.0.1");
    expect(resolveFirebaseConfig({ useEmulators: "1", emulatorHost: "192.168.1.20" }).emulatorHost).toBe("192.168.1.20");
  });
});

describe("real project", () => {
  test("unconfigured gives a clear, actionable error", () => {
    expect(() => resolveFirebaseConfig(fromExample)).toThrow(FirebaseConfigError);
    expect(() => resolveFirebaseConfig(fromExample)).toThrow(/EXPO_PUBLIC_USE_EMULATORS=1/);
  });

  test("configured passes the values through", () => {
    const env = {
      apiKey: "AIza-test", authDomain: "p.firebaseapp.com", projectId: "prayerapp-4ce99",
      storageBucket: "prayerapp-4ce99.firebasestorage.app", messagingSenderId: "123", appId: "1:123:web:abc",
    };
    const r = resolveFirebaseConfig(env);
    expect(r.usingEmulators).toBe(false);
    expect(r.options).toEqual(env);
  });
});
