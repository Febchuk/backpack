import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NpcId } from "@backpack/shared";
import { PALETTE } from "../../scripts/assets/lib";
import { decodePng, pngSize } from "../../scripts/assets/decode";

const DIR = join(import.meta.dirname, "../../apps/game/public/assets");
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as { images: Record<string, string> };
const entries = Object.entries(manifest.images);
const isBg = (key: string) => key.endsWith("_bg");

const palette = new Set(Object.values(PALETTE).map((h) => h.toLowerCase()));
const ink = PALETTE.ink.toLowerCase();
const hex = (d: Uint8Array, o: number) =>
  "#" + [d[o], d[o + 1], d[o + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");

describe("L3 assets: manifest", () => {
  it("lists every NPC id as npc_<id>, plus the player and three backgrounds", () => {
    for (const id of NpcId.options) expect(manifest.images).toHaveProperty(`npc_${id}`);
    for (const key of ["player", "airport_bg", "street_bg", "hostel_bg"]) expect(manifest.images).toHaveProperty(key);
  });

  it.each(entries)("%s points at an existing PNG", (_key, file) => {
    expect(existsSync(join(DIR, file))).toBe(true);
  });

  it.each(entries)("%s has the contract size", (key, file) => {
    const { w, h } = pngSize(readFileSync(join(DIR, file)));
    expect([w, h]).toEqual(isBg(key) ? [960, 540] : [32, 32]);
  });
});

describe("L3 assets: locked style", () => {
  it.each(entries.filter(([k]) => isBg(k)))("%s is fully opaque", (_key, file) => {
    const { data } = decodePng(readFileSync(join(DIR, file)));
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error(`transparent pixel at ${(i - 3) / 4}`);
  });

  it.each(entries.filter(([k]) => !isBg(k)))("%s has a transparent background and uses only the palette", (_key, file) => {
    const { w, h, data } = decodePng(readFileSync(join(DIR, file)));
    // corners are background
    for (const [x, y] of [[0, 0], [w - 1, 0]]) expect(data[(y * w + x) * 4 + 3]).toBe(0);
    for (let o = 0; o < data.length; o += 4) {
      const a = data[o + 3];
      if (a === 0) continue;
      const c = hex(data, o);
      // ground shadows are the only partial-alpha pixels, and they are ink
      if (a < 255) expect(c).toBe(ink);
      else expect(palette.has(c), `${c} at pixel ${o / 4} is off-palette`).toBe(true);
    }
  });
});
