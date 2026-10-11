// Minimal PNG reader for asset checks: 8-bit RGBA or RGB, non-interlaced,
// which is everything encodePng in lib.ts writes.
import { inflateSync } from "node:zlib";

export interface Png {
  w: number;
  h: number;
  /** RGBA, row-major. RGB inputs are expanded with alpha 255. */
  data: Uint8Array;
}

export function pngSize(buf: Uint8Array): { w: number; h: number } {
  const d = Buffer.from(buf);
  if (d.toString("latin1", 1, 4) !== "PNG" || d.toString("latin1", 12, 16) !== "IHDR") throw new Error("not a PNG");
  return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
}

export function decodePng(buf: Uint8Array): Png {
  const d = Buffer.from(buf);
  let i = 8;
  let w = 0;
  let h = 0;
  let bpp = 4;
  const idat: Buffer[] = [];
  while (i < d.length) {
    const n = d.readUInt32BE(i);
    const type = d.toString("latin1", i + 4, i + 8);
    const body = d.subarray(i + 8, i + 8 + n);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("only 8-bit non-interlaced PNGs are supported");
      if (body[9] === 6) bpp = 4;
      else if (body[9] === 2) bpp = 3;
      else throw new Error(`unsupported PNG color type ${body[9]}`);
    }
    if (type === "IDAT") idat.push(body);
    i += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const data = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  let k = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[k++];
    const line = Uint8Array.from(raw.subarray(k, k + stride));
    k += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] += a;
      else if (filter === 2) line[x] += b;
      else if (filter === 3) line[x] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      data[o] = line[x * bpp];
      data[o + 1] = line[x * bpp + 1];
      data[o + 2] = line[x * bpp + 2];
      data[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data };
}
