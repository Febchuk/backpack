import { describe, expect, it } from "vitest";
import {
  decode,
  encode,
  linearToMulaw,
  mulawToLinear,
  parseDialFormat,
  parseElevenLabsFormat,
  resample,
  transcode,
} from "../../apps/server/src/voice/codec";
import { lunaCallSetup, openingLine } from "../../apps/server/src/voice/prompt";
import { introInstruction, debriefInstruction } from "../../apps/server/src/luna/instructions";

const MULAW = { encoding: "mulaw", rate: 8000 } as const;
const PCM8 = { encoding: "pcm16", rate: 8000 } as const;
const PCM16 = { encoding: "pcm16", rate: 16000 } as const;
const PCM24 = { encoding: "pcm16", rate: 24000 } as const;

function sine(rate: number, ms: number, hz = 440, amp = 12000) {
  const n = Math.round((rate * ms) / 1000);
  return Int16Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate)));
}

describe("L2.5 voice bridge: μ-law / PCM codec", () => {
  it("μ-law decode → encode is the identity on every byte (0x7f and 0xff are both zero)", () => {
    for (let b = 0; b < 256; b++) {
      const back = linearToMulaw(mulawToLinear(b));
      expect(b === 0x7f ? back === 0xff || back === 0x7f : back === b).toBe(true);
    }
  });

  it("matches G.711 reference points", () => {
    expect(linearToMulaw(0)).toBe(0xff);
    expect(mulawToLinear(0xff)).toBe(0);
    expect(mulawToLinear(0x80)).toBe(32124);
    expect(mulawToLinear(0x00)).toBe(-32124);
    expect(linearToMulaw(32767)).toBe(0x80);
    expect(linearToMulaw(-32768)).toBe(0x00);
  });

  it("PCM → μ-law → PCM keeps the error within one μ-law step", () => {
    for (let s = -32768; s <= 32767; s += 97) {
      const back = mulawToLinear(linearToMulaw(s));
      const step = Math.max(8, Math.abs(s) / 16); // segment step ≈ 1/16 of the magnitude
      expect(Math.abs(back - Math.max(-32124, Math.min(32124, s)))).toBeLessThanOrEqual(step);
    }
  });

  it("PCM16 little-endian encode/decode round trips exactly", () => {
    const x = Int16Array.from([0, 1, -1, 32767, -32768, 1234, -4321]);
    expect(Array.from(decode(encode(x, PCM16), PCM16))).toEqual(Array.from(x));
    expect(encode(Int16Array.from([0x0102]), PCM8)).toEqual(Buffer.from([0x02, 0x01]));
  });

  it("resamples with the right lengths and keeps a tone's amplitude", () => {
    const tone = sine(24000, 20);
    const down = resample(tone, 24000, 8000);
    expect(down.length).toBe(160);
    expect(Math.max(...down)).toBeGreaterThan(10000);
    const up = resample(sine(8000, 20), 8000, 16000);
    expect(up.length).toBe(320);
    expect(resample(tone, 24000, 24000)).toBe(tone);
  });

  it("transcode: μ-law 8k ↔ PCM16 16k/24k sizes, and same-format passthrough", () => {
    const mulaw = encode(sine(8000, 20), MULAW);
    expect(mulaw.length).toBe(160);
    expect(transcode(mulaw, MULAW, MULAW)).toBe(mulaw);
    const pcm16 = transcode(mulaw, MULAW, PCM16);
    expect(pcm16.length).toBe(640);
    expect(transcode(pcm16, PCM16, MULAW).length).toBe(160);
    expect(transcode(encode(sine(24000, 20), PCM24), PCM24, MULAW).length).toBe(160);
    // A round trip through PCM 16k stays close to the original tone.
    const back = decode(transcode(pcm16, PCM16, MULAW), MULAW);
    const orig = decode(mulaw, MULAW);
    const err = back.reduce((m, v, i) => Math.max(m, Math.abs(v - orig[i])), 0);
    expect(err).toBeLessThan(1500);
  });

  it("parses Dial and ElevenLabs format names", () => {
    expect(parseDialFormat("mulaw_8000")).toEqual(MULAW);
    expect(parseDialFormat("l16_24000")).toEqual(PCM24);
    expect(() => parseDialFormat("alaw_8000")).toThrow(/unsupported/);
    expect(parseElevenLabsFormat("ulaw_8000")).toEqual(MULAW);
    expect(parseElevenLabsFormat("pcm_16000")).toEqual(PCM16);
  });
});

describe("L2.5 voice bridge: Luna's call setup", () => {
  it("takes the first message from the scripted opening line", () => {
    expect(openingLine(introInstruction())).toBe("Bonjour ! C'est Luna, ton guide à Paris. Je suis une IA.");
    expect(openingLine(debriefInstruction(["Un café, s'il vous plaît"]))).toBe("Bonsoir ! C'est Luna, ton guide IA.");
  });

  it("falls back to a generic Luna for calls the game did not place", () => {
    const repoStub = { missedPhrases: () => [] } as unknown as Parameters<typeof lunaCallSetup>[0];
    const setup = lunaCallSetup(repoStub, null);
    expect(setup.firstMessage).toMatch(/Luna/);
    expect(setup.prompt).toMatch(/not one you placed/);
  });
});
