/** Thrown when the mic is unavailable or blocked; the game should fall back to the text path. */
export class MicUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MicUnavailableError";
  }
}

export interface HoldToTalk {
  /** Starts recording. Rejects with MicUnavailableError if the mic is blocked or unsupported. */
  start(): Promise<void>;
  /** Stops recording and resolves with the webm blob (also passed to onBlob). */
  stop(): Promise<Blob>;
  readonly recording: boolean;
}

/** Browser MediaRecorder hold-to-talk helper. No Phaser dependency: the game wires start/stop to a key. */
export function createHoldToTalk(opts: { onBlob?: (blob: Blob) => void } = {}): HoldToTalk {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  };

  return {
    get recording() {
      return recorder?.state === "recording";
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
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      chunks = [];
      recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
    },

    stop() {
      const rec = recorder;
      if (!rec) return Promise.reject(new Error("Not recording"));
      return new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          chunks = [];
          release();
          opts.onBlob?.(blob);
          resolve(blob);
        };
        rec.stop();
      });
    },
  };
}
