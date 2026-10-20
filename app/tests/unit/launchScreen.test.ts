import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const config = readFileSync("app.config.ts", "utf8");
const ui = readFileSync("src/components/ui.tsx", "utf8");

/** The `bg` color of one palette in ui.tsx (`const light = {` / `const dark = {`). */
function bgOf(palette: "light" | "dark"): string {
  const block = ui.slice(ui.indexOf(`const ${palette}`));
  return /bg: "(#[0-9A-Fa-f]{6})"/.exec(block)![1];
}

describe("launch screen", () => {
  test("uses the app's own background, light and dark, so it fades straight into the first screen", () => {
    const splash = config.slice(config.indexOf('"expo-splash-screen"'));
    expect(/backgroundColor: "(#[0-9A-Fa-f]{6})"/.exec(splash)![1]).toBe(bgOf("light"));
    expect(/dark: \{[^}]*backgroundColor: "(#[0-9A-Fa-f]{6})"/.exec(splash)![1]).toBe(bgOf("dark"));
  });

  test("its images are in the app", () => {
    for (const f of ["assets/splash-light.png", "assets/splash-dark.png"]) {
      expect(existsSync(f)).toBe(true);
      expect(config).toContain(`./${f}`);
    }
  });

  test("is always hidden, even if loading never finishes", () => {
    const layout = readFileSync("src/app/_layout.tsx", "utf8");
    expect(layout).toContain("preventAutoHideAsync");
    expect(layout).toMatch(/setTimeout\(hideSplash, SPLASH_MAX_MS\)/);
  });
});
