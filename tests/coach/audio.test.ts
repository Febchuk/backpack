// Lane C: which inbound audio reaches Gemini untouched and which is transcoded first.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiAudioMime, planAudio, prepareAudio, sniffAudioMime, transcodeToFlac } from "../../apps/coach/src/voice/audio";

const bytes = (head: string, rest = 16) => Buffer.concat([Buffer.from(head, "latin1"), Buffer.alloc(rest)]);
const CAF = bytes("caff\x00\x01\x00\x00desc");
const AMR = bytes("#!AMR\n");
const M4A = bytes("\x00\x00\x00\x20ftypM4A ");
const GP3 = bytes("\x00\x00\x00\x18ftyp3gp4");
const MP3 = bytes("ID3\x04");
const AAC = Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0]);
const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]).status === 0;

describe("coach audio formats", () => {
  it("maps the aliases phones send onto Gemini's types and rejects the rest", () => {
    expect(geminiAudioMime("audio/x-m4a")).toBe("audio/m4a");
    expect(geminiAudioMime("audio/mp4")).toBe("audio/m4a");
    expect(geminiAudioMime("Audio/MPEG; charset=binary")).toBe("audio/mpeg");
    expect(geminiAudioMime("audio/x-wav")).toBe("audio/wav");
    for (const t of ["audio/x-caf", "audio/amr", "audio/3gpp", "application/octet-stream", ""]) expect(geminiAudioMime(t)).toBeNull();
  });

  it("sniffs containers from their magic bytes", () => {
    expect(sniffAudioMime(CAF)).toBe("audio/x-caf");
    expect(sniffAudioMime(AMR)).toBe("audio/amr");
    expect(sniffAudioMime(M4A)).toBe("audio/mp4");
    expect(sniffAudioMime(GP3)).toBe("audio/3gpp");
    expect(sniffAudioMime(MP3)).toBe("audio/mpeg");
    expect(sniffAudioMime(AAC)).toBe("audio/aac");
    expect(sniffAudioMime(Buffer.from("bonjour"))).toBeNull();
  });

  it("passes supported types through, trusts bytes over a useless label, transcodes CAF/AMR/3GPP/unknown", () => {
    expect(planAudio(Buffer.from("bonjour"), "audio/x-m4a")).toEqual({ action: "passthrough", mimeType: "audio/x-m4a" });
    expect(planAudio(M4A, "application/octet-stream")).toEqual({ action: "passthrough", mimeType: "audio/mp4" });
    expect(planAudio(CAF, "audio/x-caf")).toEqual({ action: "transcode", from: "audio/x-caf" });
    expect(planAudio(CAF, "application/octet-stream")).toEqual({ action: "transcode", from: "audio/x-caf" });
    expect(planAudio(AMR, "audio/amr")).toEqual({ action: "transcode", from: "audio/amr" });
    expect(planAudio(GP3, "audio/3gpp")).toEqual({ action: "transcode", from: "audio/3gpp" });
    expect(planAudio(Buffer.from("???"), "")).toEqual({ action: "transcode", from: "unknown" });
  });

  it("prepareAudio transcodes only when needed and labels the result FLAC", async () => {
    const calls: Buffer[] = [];
    const fake = async (a: Buffer) => (calls.push(a), Buffer.from("fLaC"));
    expect(await prepareAudio(MP3, "audio/mpeg", fake)).toEqual({ audio: MP3, mimeType: "audio/mpeg" });
    expect(await prepareAudio(CAF, "audio/x-caf", fake)).toEqual({ audio: Buffer.from("fLaC"), mimeType: "audio/flac" });
    expect(calls).toEqual([CAF]);
  });

  it("reports a missing ffmpeg clearly", async () => {
    await expect(transcodeToFlac(CAF, "/nonexistent/ffmpeg")).rejects.toThrow(/ffmpeg not found/);
  });

  it.skipIf(!hasFfmpeg)("transcodes a real CAF (iMessage voice message container) to FLAC", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coach-audio-test-"));
    const caf = join(dir, "note.caf");
    const r = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-c:a", "alac", "-f", "caf", caf]);
    expect(r.status).toBe(0);
    const flac = await transcodeToFlac(readFileSync(caf));
    expect(sniffAudioMime(flac)).toBe("audio/flac");
  });
});
