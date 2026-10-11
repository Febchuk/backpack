// Shared drawing kit for procedural placeholder art: locked palette, a tiny
// pixel canvas, a 5x7 bitmap font and a dependency-free PNG encoder.
import { deflateSync } from "node:zlib";

// Locked palette. Keep in sync with docs/STYLE_PROMPT.md.
export const PALETTE = {
  ink: "#1b1c2e",
  navy: "#2b3a67",
  zincDark: "#4a4e5a",
  zinc: "#8a8f98",
  cream: "#f2e6c9",
  paper: "#fff8e7",
  terracotta: "#c4623f",
  woodDark: "#6b4226",
  wood: "#a0683a",
  red: "#b8323a",
  green: "#2f6b4f",
  gold: "#e0a944",
  skin: "#f1c09a",
  sage: "#8fb37a",
  sky: "#6ea8c9",
  plum: "#5a2a32",
} as const;
export type Color = keyof typeof PALETTE;

function rgb(c: Color): [number, number, number] {
  const h = PALETTE[c];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export class Canvas {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h * 4);
  }
  px(x: number, y: number, c: Color, alpha = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = rgb(c);
    if (alpha === 255 || this.data[i + 3] === 0) {
      this.data.set([r, g, b, alpha], i);
      return;
    }
    const a = alpha / 255;
    this.data[i] = Math.round(r * a + this.data[i] * (1 - a));
    this.data[i + 1] = Math.round(g * a + this.data[i + 1] * (1 - a));
    this.data[i + 2] = Math.round(b * a + this.data[i + 2] * (1 - a));
    this.data[i + 3] = 255;
  }
  opaque(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  frame(x: number, y: number, w: number, h: number, c: Color) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }
  /** Checkerboard dither of two colors, the classic 16-bit shading trick. */
  dither(x: number, y: number, w: number, h: number, a: Color, b: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, (x + i + y + j) % 2 ? a : b);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, alpha = 255) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, alpha);
      }
  }
  /** 1px outline around every opaque pixel (4-neighbour), for sprites. */
  outline(c: Color) {
    const edge: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!this.opaque(x, y) && (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)))
          edge.push([x, y]);
    for (const [x, y] of edge) this.px(x, y, c);
  }
  /** Nearest-neighbour upscale so backgrounds keep chunky 2x pixels. */
  scale(k: number): Canvas {
    const out = new Canvas(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++)
      for (let x = 0; x < out.w; x++) {
        const s = (Math.floor(y / k) * this.w + Math.floor(x / k)) * 4;
        out.data.set(this.data.subarray(s, s + 4), (y * out.w + x) * 4);
      }
    return out;
  }
}

// ---- 5x7 bitmap font -------------------------------------------------------
const GLYPHS: Record<string, string> = {
  A: ".###. #...# #...# ##### #...# #...# #...#",
  B: "####. #...# #...# ####. #...# #...# ####.",
  C: ".###. #...# #.... #.... #.... #...# .###.",
  D: "####. #...# #...# #...# #...# #...# ####.",
  E: "##### #.... #.... ####. #.... #.... #####",
  F: "##### #.... #.... ####. #.... #.... #....",
  G: ".###. #...# #.... #.### #...# #...# .####",
  H: "#...# #...# #...# ##### #...# #...# #...#",
  I: ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  J: "..### ...#. ...#. ...#. ...#. #..#. .##..",
  K: "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
  L: "#.... #.... #.... #.... #.... #.... #####",
  M: "#...# ##.## #.#.# #.#.# #...# #...# #...#",
  N: "#...# #...# ##..# #.#.# #..## #...# #...#",
  O: ".###. #...# #...# #...# #...# #...# .###.",
  P: "####. #...# #...# ####. #.... #.... #....",
  Q: ".###. #...# #...# #...# #.#.# #..#. .##.#",
  R: "####. #...# #...# ####. #.#.. #..#. #...#",
  S: ".#### #.... #.... .###. ....# ....# ####.",
  T: "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  U: "#...# #...# #...# #...# #...# #...# .###.",
  V: "#...# #...# #...# #...# #...# .#.#. ..#..",
  W: "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
  X: "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  Y: "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
  Z: "##### ....# ...#. ..#.. .#... #.... #####",
  "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  "2": ".###. #...# ....# ...#. ..#.. .#... #####",
  "<": "...#. ..#.. .#... #.... .#... ..#.. ...#.",
  ">": ".#... ..#.. ...#. ....# ...#. ..#.. .#...",
  "-": "..... ..... ..... .###. ..... ..... .....",
  "!": "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
  ".": "..... ..... ..... ..... ..... ..... ..#..",
  " ": "..... ..... ..... ..... ..... ..... .....",
};
// Accented capitals: base glyph plus accent pixels drawn above the cap line.
const ACCENTS: Record<string, [string, [number, number][]]> = {
  "À": ["A", [[1, -2], [2, -1]]],
  "É": ["E", [[3, -2], [2, -1]]],
};

export function textWidth(s: string, scale = 1) {
  return (s.length * 6 - 1) * scale;
}

export function text(cv: Canvas, s: string, x: number, y: number, c: Color, scale = 1) {
  for (const ch of s.toUpperCase()) {
    const acc = ACCENTS[ch];
    const glyph = GLYPHS[acc ? acc[0] : ch] ?? GLYPHS[" "];
    const rows = glyph.split(" ");
    rows.forEach((row, j) => [...row].forEach((p, i) => p === "#" && cv.rect(x + i * scale, y + j * scale, scale, scale, c)));
    if (acc) for (const [i, j] of acc[1]) cv.rect(x + i * scale, y + j * scale, scale, scale, c);
    x += 6 * scale;
  }
}

/** Centered text with a 1px drop shadow, used for every sign. */
export function sign(cv: Canvas, s: string, cx: number, y: number, c: Color, shadow: Color, scale = 1) {
  const x = Math.round(cx - textWidth(s, scale) / 2);
  text(cv, s, x + scale, y + scale, shadow, scale);
  text(cv, s, x, y, c, scale);
}

// ---- PNG encoder -------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function encodePng(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = cv.w * 4;
  const raw = Buffer.alloc((stride + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) Buffer.from(cv.data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
