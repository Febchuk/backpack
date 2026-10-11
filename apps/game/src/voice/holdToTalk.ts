/** Thrown when the mic is unavailable or blocked; the game should fall back to the text path. */
export class MicUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MicUnavailableError";
  }
}

/** Recordings are capped so a stuck key never uploads a huge clip (and Gemini stays fast). */
export const MAX_RECORDING_MS = 15_000;

/** Container types Gemini accepts as inline audio, in order of preference. Safari only records mp4/aac. */
export const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];

/** The first preferred type this browser's MediaRecorder supports, or "" to let the browser pick. */
export function pickMimeType(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string {
  return PREFERRED_MIME_TYPES.find((t) => isSupported(t)) ?? "";
}

/** A filename whose extension matches the blob, for the multipart upload. */
export function audioFilename(mimeType: string): string {
  const base = mimeType.split(";")[0];
  const ext = base === "audio/mp4" ? "m4a" : base === "audio/aac" ? "aac" : base === "audio/ogg" ? "ogg" : "webm";
  return `turn.${ext}`;
}

export interface HoldToTalk {
  /** Starts recording. Rejects with MicUnavailableError if the mic is blocked or unsupported. */
  start(): Promise<void>;
  /**
   * Stops recording and resolves with the audio blob (also passed to onBlob). The blob's `type` is the
   * recorder's mime type; send it as-is so the server forwards it to Gemini. After MAX_RECORDING_MS the
   * recording stops by itself; a later stop() still resolves with that blob.
   */
  stop(): Promise<Blob>;
  readonly recording: boolean;
  /** Mime type of the current or last recording, e.g. "audio/webm;codecs=opus". Empty before the first start. */
  readonly mimeType: string;
}

/** Browser MediaRecorder hold-to-talk helper. No Phaser dependency: the game wires start/stop to a key. */
export function createHoldToTalk(opts: { onBlob?: (blob: Blob) => void; maxMs?: number } = {}): HoldToTalk {
  const maxMs = opts.maxMs ?? MAX_RECORDING_MS;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let done: Promise<Blob> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let mimeType = "";

  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  };

  return {
    get recording() {
      return recorder?.state === "recording";
    },

    get mimeType() {
      return mimeType;
    },

    async start() {
      if (recorder) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new MicUnavailableError("Microphone recording is not supported in this browser");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        throw new MicUnavailableError("Microphone permission denied or no microphone found", e);
      }
      const wanted = pickMimeType();
      const rec = new MediaRecorder(stream, wanted ? { mimeType: wanted } : undefined);
      recorder = rec;
      mimeType = rec.mimeType || wanted || "audio/webm";
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      done = new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          release();
          opts.onBlob?.(blob);
          resolve(blob);
        };
      });
      rec.start();
      timer = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, maxMs);
    },

    stop() {
      if (!done) return Promise.reject(new Error("Not recording"));
      const result = done;
      done = null;
      if (recorder?.state === "recording") recorder.stop();
      return result;
    },
  };
}
