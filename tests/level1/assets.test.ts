import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const ASSETS = "apps/game/public/assets";
const REQUIRED = ["airport_bg", "street_bg", "hostel_bg", "player", "npc_clerk", "npc_barista", "npc_girard", "npc_margaux"];

function pngSize(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("L1 assets lane", () => {
  it("locked style prompt is documented", () => {
    const doc = readFileSync("docs/STYLE_PROMPT.md", "utf8");
    expect(doc).toContain("16-bit pixel art, top-down, limited palette, Paris café colors");
  });

  it("manifest lists every required key and each file exists with the right size", () => {
    const manifest = JSON.parse(readFileSync(`${ASSETS}/manifest.json`, "utf8"));
    for (const key of REQUIRED) {
      const file = manifest.images[key];
      expect(file, key).toBeTruthy();
      expect(existsSync(`${ASSETS}/${file}`), file).toBe(true);
      const { w, h } = pngSize(`${ASSETS}/${file}`);
      if (key.endsWith("_bg")) expect([w, h]).toEqual([960, 540]);
      else expect([w, h]).toEqual([32, 32]);
    }
  });
});
