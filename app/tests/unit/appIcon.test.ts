import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the app icon has light, dark and tinted versions, all present", () => {
  const config = readFileSync("app.config.ts", "utf8");
  for (const f of ["icon.png", "icon-dark.png", "icon-tinted.png"]) {
    expect(config).toContain(`./assets/${f}`);
    expect(existsSync(`assets/${f}`), f).toBe(true);
  }
});
