// Pixel helpers for Gemini art post-processing: a minimal PNG decoder, palette
// quantisation, backdrop keying and nearest-neighbour resampling. RGBA buffers
// throughout, in the same layout as `Canvas` from scripts/assets/lib.ts.
import { inflateSync } from "node:zlib";
import { Canvas, PALETTE } from "../assets/lib";

export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(buf: Uint8Array) {
  return PNG_SIG.every((b, i) => buf[i] === b);
}

/** Decodes a non-interlaced PNG (any colour type, bit depth 1 to 16) to 8-bit RGBA. */
export function decodePng(buf: Buffer): Rgba {
  if (!isPng(buf)) throw new Error("not a PNG (Gemini returned another format)");
  let pos = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === "PLTE") plte = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
  }
  if (interlace) throw new Error("interlaced PNGs are not supported");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unsupported PNG colour type ${type}`);

  const bitsPerPx = channels * depth;
  const stride = Math.ceil((w * bitsPerPx) / 8);
  const bpp = Math.max(1, bitsPerPx >> 3); // filter byte distance
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 0xff;
    }
  }

  // Sample n-th channel value of pixel x on row y, scaled to 8 bits.
  const max = (1 << depth) - 1;
  const sample = (y: number, x: number, ch: number): number => {
    const row = y * stride;
    if (depth === 8) return rows[row + x * channels + ch];
    if (depth === 16) return rows[row + (x * channels + ch) * 2];
    const bit = (x * channels + ch) * depth;
    const v = (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
    return type === 3 ? v : Math.round((v * 255) / max);
  };

  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const i = sample(y, x, 0);
        data.set([plte![i * 3], plte![i * 3 + 1], plte![i * 3 + 2], trns && i < trns.length ? trns[i] : 255], o);
      } else if (type === 0 || type === 4) {
        const g = sample(y, x, 0);
        data.set([g, g, g, type === 4 ? sample(y, x, 1) : 255], o);
      } else {
        data.set([sample(y, x, 0), sample(y, x, 1), sample(y, x, 2), type === 6 ? sample(y, x, 3) : 255], o);
      }
    }
  return { w, h, data };
}

export const PALETTE_RGB: [number, number, number][] = Object.values(PALETTE).map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

/** Perceptual-ish RGB distance ("redmean"), cheap and good enough for a 16-colour palette. */
export function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Snaps every opaque pixel to the nearest locked palette colour, in place. */
export function quantize(img: Rgba) {
  const cache = new Map<number, number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      best = 0;
      PALETTE_RGB.forEach(([r, g, b], j) => {
        const dist = colorDist(d[i], d[i + 1], d[i + 2], r, g, b);
        if (dist < bd) (bd = dist), (best = j);
      });
      cache.set(key, best);
    }
    d.set(PALETTE_RGB[best], i);
  }
}

/** Centre crop to the target aspect ratio. */
export function cropToAspect(img: Rgba, aw: number, ah: number): Rgba {
  let w = img.w, h = Math.round((img.w * ah) / aw);
  if (h > img.h) (h = img.h), (w = Math.round((img.h * aw) / ah));
  return crop(img, Math.floor((img.w - w) / 2), Math.floor((img.h - h) / 2), w, h);
}

export function crop(img: Rgba, x0: number, y0: number, w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4), y * w * 4);
  return { w, h, data };
}

/** Nearest-neighbour resample: each output pixel takes the source pixel at its cell centre. */
export function resizeNearest(img: Rgba, w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor(((x + 0.5) * img.w) / w));
      const sy = Math.min(img.h - 1, Math.floor(((y + 0.5) * img.h) / h));
      const s = (sy * img.w + sx) * 4;
      data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  return { w, h, data };
}

export function makeOpaque(img: Rgba) {
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
}

/**
 * Keys out the backdrop: finds the dominant colours along the image border (one flat fill, or the two tones
 * of a fake "transparency" checkerboard) and flood-fills transparent from the edges through pixels close to
 * them. Interior pixels of the same colour that are not connected to the edge are kept.
 */
export function keyBackdrop(img: Rgba, tolerance = 48): number {
  const { w, h, data: d } = img;
  if (d.some((v, i) => i % 4 === 3 && v < 128)) {
    // The model returned real alpha: trust it, just binarise.
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 128 ? 0 : 255;
    return 0;
  }
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const clusters: { r: number; g: number; b: number; n: number }[] = [];
  for (const p of border) {
    const [r, g, b] = d.subarray(p * 4, p * 4 + 3);
    const c = clusters.find((k) => colorDist(r, g, b, k.r, k.g, k.b) < tolerance);
    if (c) c.n++;
    else clusters.push({ r, g, b, n: 1 });
  }
  const keys = clusters.filter((c) => c.n >= border.length * 0.15);
  const isKey = (p: number) => keys.some((k) => colorDist(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], k.r, k.g, k.b) < tolerance);

  const seen = new Uint8Array(w * h);
  const stack = border.filter(isKey);
  let keyed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isKey(p)) continue;
    d[p * 4 + 3] = 0;
    keyed++;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return keyed;
}

/** Bounding box of the opaque pixels, or null when everything was keyed out. */
export function opaqueBounds(img: Rgba) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3]) {
        x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Pastes `src` into `dst` at (x, y), skipping fully transparent pixels. */
export function blit(dst: Rgba, src: Rgba, x: number, y: number) {
  for (let j = 0; j < src.h; j++)
    for (let i = 0; i < src.w; i++) {
      const s = (j * src.w + i) * 4;
      if (!src.data[s + 3]) continue;
      const dx = x + i, dy = y + j;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      dst.data.set(src.data.subarray(s, s + 4), (dy * dst.w + dx) * 4);
    }
}

export function toCanvas(img: Rgba): Canvas {
  const cv = new Canvas(img.w, img.h);
  cv.data.set(img.data);
  return cv;
}

export function pngSize(buf: Buffer): { w: number; h: number } {
  if (!isPng(buf)) throw new Error("not a PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
