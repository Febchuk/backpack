import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Gemini's documented audio input types, keyed by the aliases phones and carriers actually send. */
const GEMINI_AUDIO: Record<string, string> = {
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/mp3": "audio/mp3",
  "audio/mpeg": "audio/mpeg",
  "audio/mpeg3": "audio/mp3",
  "audio/x-mpeg-3": "audio/mp3",
  "audio/aiff": "audio/aiff",
  "audio/x-aiff": "audio/aiff",
  "audio/aac": "audio/aac",
  "audio/x-aac": "audio/aac",
  "audio/ogg": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
  "audio/m4a": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/mp4": "audio/m4a",
  "audio/opus": "audio/opus",
  "audio/webm": "audio/webm",
};

/** Bare, lower-cased media type: "Audio/AMR; rate=8000" → "audio/amr". */
export function baseMime(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0].trim().toLowerCase();
}

/** The type to hand Gemini for `mimeType`, or null when Gemini doesn't accept it (CAF, AMR, 3GPP, unknown). */
export function geminiAudioMime(mimeType: string): string | null {
  return GEMINI_AUDIO[baseMime(mimeType)] ?? null;
}

/** Container type from the first bytes, for media served as application/octet-stream or mislabelled. */
export function sniffAudioMime(audio: Buffer): string | null {
  const ascii = (start: number, end: number) => audio.subarray(start, end).toString("latin1");
  if (ascii(0, 4) === "caff") return "audio/x-caf";
  if (ascii(0, 5) === "#!AMR") return "audio/amr";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "FORM" && ascii(8, 11) === "AIF") return "audio/aiff";
  if (audio.length >= 4 && audio.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  if (ascii(4, 8) === "ftyp") return /^3g/.test(ascii(8, 11)) ? "audio/3gpp" : "audio/mp4";
  if (ascii(0, 3) === "ID3" || (audio.length >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)) {
    // ADTS AAC shares the frame-sync bits with MP3; its layer bits are 00.
    return !audio.subarray(0, 3).equals(Buffer.from("ID3")) && (audio[1] & 0x06) === 0 ? "audio/aac" : "audio/mpeg";
  }
  return null;
}

export type AudioPlan = { action: "passthrough"; mimeType: string } | { action: "transcode"; from: string };

/**
 * What to do with inbound audio before Gemini sees it. A declared type Gemini accepts passes through untouched;
 * otherwise the bytes decide, and anything Gemini can't read (iMessage CAF, MMS AMR/3GPP) is transcoded.
 */
export function planAudio(audio: Buffer, declared: string): AudioPlan {
  if (geminiAudioMime(declared)) return { action: "passthrough", mimeType: declared };
  const sniffed = sniffAudioMime(audio);
  if (sniffed && geminiAudioMime(sniffed)) return { action: "passthrough", mimeType: sniffed };
  return { action: "transcode", from: sniffed ?? (baseMime(declared) || "unknown") };
}

/** Transcodes any ffmpeg-readable audio to 16 kHz mono FLAC (lossless, small, accepted by Gemini). */
export async function transcodeToFlac(audio: Buffer, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg"): Promise<Buffer> {
  // A temp file rather than a pipe: CAF and MP4 demuxers need to seek.
  const dir = await mkdtemp(join(tmpdir(), "coach-audio-"));
  const input = join(dir, "in");
  try {
    await writeFile(input, audio);
    return await new Promise<Buffer>((resolve, reject) => {
      const proc = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-f", "flac", "pipe:1"]);
      const out: Buffer[] = [];
      let err = "";
      proc.stdout.on("data", (d: Buffer) => out.push(d));
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("error", (e: NodeJS.ErrnoException) =>
        reject(new Error(e.code === "ENOENT" ? `ffmpeg not found (${ffmpegPath}); install it or set FFMPEG_PATH` : `ffmpeg: ${e.message}`)),
      );
      proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(0, 300)}`))));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Audio Gemini can read: passes supported types through, transcodes the rest. */
export async function prepareAudio(
  audio: Buffer,
  declared: string,
  transcode: (audio: Buffer) => Promise<Buffer> = transcodeToFlac,
): Promise<{ audio: Buffer; mimeType: string }> {
  const plan = planAudio(audio, declared);
  if (plan.action === "passthrough") return { audio, mimeType: plan.mimeType };
  return { audio: await transcode(audio), mimeType: "audio/flac" };
}
