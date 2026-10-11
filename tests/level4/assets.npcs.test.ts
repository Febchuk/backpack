import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng } from "../../scripts/assets/decode";

const DIR = join(import.meta.dirname, "../../apps/game/public/assets");
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as { images: Record<string, string> };

describe("L4 assets: Inès and Théo", () => {
  it.each([
    ["npc_ines", "npc_ines.png"],
    ["npc_theo", "npc_theo.png"],
  ])("%s is in the manifest as a 32x32 sprite with a real figure", (key, file) => {
    expect(manifest.images[key]).toBe(file);
    const { w, h, data } = decodePng(readFileSync(join(DIR, file)));
    expect([w, h]).toEqual([32, 32]);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
    // a drawn character, not an empty or solid placeholder square
    expect(opaque).toBeGreaterThan(200);
    expect(opaque).toBeLessThan(32 * 32 - 100);
  });

  it("the two new sprites are distinct from every other sprite", () => {
    const sprites = Object.entries(manifest.images).filter(([k]) => !k.endsWith("_bg"));
    const bytes = sprites.map(([, f]) => readFileSync(join(DIR, f)).toString("base64"));
    expect(new Set(bytes).size).toBe(sprites.length);
  });
});
