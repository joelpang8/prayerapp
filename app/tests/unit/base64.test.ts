import { expect, test } from "vitest";
import { bytesToBase64 } from "../../src/lib/base64";

test.each([0, 1, 2, 3, 4, 5, 255, 1000])("matches Node's encoder for %i bytes", (n) => {
  const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) % 256);
  expect(bytesToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString("base64"));
});
