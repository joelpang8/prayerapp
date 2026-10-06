import { describe, expect, test, vi } from "vitest";

// expo-location is native; only the pure formatter is tested here.
vi.mock("expo-location", () => ({}));
const { placeName } = await import("../../src/lib/location");

const blank = { city: null, district: null, subregion: null, region: null, country: null };

describe("placeName", () => {
  test("town and region", () => {
    expect(placeName({ ...blank, city: "Austin", region: "Texas", country: "United States" })).toBe("Austin, Texas");
  });

  test("falls back to county or district, and to country when there's no region", () => {
    expect(placeName({ ...blank, subregion: "Travis County", region: "Texas" })).toBe("Travis County, Texas");
    expect(placeName({ ...blank, city: "Singapore", region: "Singapore", country: "Singapore" })).toBe("Singapore");
    expect(placeName({ ...blank, city: "Lyon", country: "France" })).toBe("Lyon, France");
  });

  test("never includes a street", () => {
    const withStreet = { ...blank, city: "Austin", region: "Texas", street: "Congress Ave", name: "123 Congress Ave" } as never;
    expect(placeName(withStreet)).toBe("Austin, Texas");
  });

  test("nothing usable gives null", () => {
    expect(placeName(blank)).toBeNull();
  });

  test("is capped at 80 characters (the rules' limit)", () => {
    expect(placeName({ ...blank, city: "x".repeat(100), region: "y" })!.length).toBe(80);
  });
});
