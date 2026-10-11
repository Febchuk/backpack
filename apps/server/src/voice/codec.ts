/** Mono audio formats on either side of the bridge, and the small codec that converts between them. */
export interface AudioFormat {
  encoding: "mulaw" | "pcm16";
  rate: number;
}

/** Dial self-hosted audio formats (`mulaw_8000`, `l16_16000`, ...). A-law is not supported. */
export function parseDialFormat(name: string): AudioFormat {
  if (name === "mulaw_8000") return { encoding: "mulaw", rate: 8000 };
  const m = /^l16_(8000|16000|24000)$/.exec(name);
  if (m) return { encoding: "pcm16", rate: Number(m[1]) };
  throw new Error(`unsupported Dial audio format ${name}`);
}

/** ElevenLabs Agents formats (`ulaw_8000`, `pcm_16000`, ...). */
export function parseElevenLabsFormat(name: string): AudioFormat {
  if (name === "ulaw_8000") return { encoding: "mulaw", rate: 8000 };
  const m = /^pcm_(\d+)$/.exec(name);
  if (m) return { encoding: "pcm16", rate: Number(m[1]) };
  throw new Error(`unsupported ElevenLabs audio format ${name}`);
}

export const sameFormat = (a: AudioFormat, b: AudioFormat) => a.encoding === b.encoding && a.rate === b.rate;

const BIAS = 0x84;
const CLIP = 32635;

/** G.711 μ-law encode of one signed 16-bit sample. */
export function linearToMulaw(sample: number): number {
  let s = sample;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** G.711 μ-law decode of one byte to a signed 16-bit sample. */
export function mulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const exponent = (u >> 4) & 0x07;
  const s = ((((u & 0x0f) << 3) + BIAS) << exponent) - BIAS;
  return u & 0x80 ? -s : s;
}

export function decode(buf: Buffer, f: AudioFormat): Int16Array {
  if (f.encoding === "mulaw") {
    const out = new Int16Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = mulawToLinear(buf[i]);
    return out;
  }
  const n = buf.length >> 1;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

export function encode(samples: Int16Array, f: AudioFormat): Buffer {
  if (f.encoding === "mulaw") {
    const out = Buffer.alloc(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = linearToMulaw(samples[i]);
    return out;
  }
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(samples[i], i * 2);
  return out;
}

/**
 * Stateless per-chunk resampler: box-filter averaging when downsampling (a crude low-pass that keeps
 * 24/16 kHz TTS from aliasing on an 8 kHz line), linear interpolation when upsampling.
 */
export function resample(input: Int16Array, from: number, to: number): Int16Array {
  if (from === to || input.length === 0) return input;
  const outLen = Math.max(1, Math.round((input.length * to) / from));
  const out = new Int16Array(outLen);
  const step = from / to;
  if (step > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * step)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      out[i] = Math.round(sum / (end - start));
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * step;
      const j = Math.floor(pos);
      const a = input[Math.min(j, input.length - 1)];
      const b = input[Math.min(j + 1, input.length - 1)];
      out[i] = Math.round(a + (b - a) * (pos - j));
    }
  }
  return out;
}

/** Converts raw audio bytes between formats; returns the input untouched when the formats match. */
export function transcode(buf: Buffer, from: AudioFormat, to: AudioFormat): Buffer {
  if (sameFormat(from, to)) return buf;
  return encode(resample(decode(buf, from), from.rate, to.rate), to);
}
