import { createHoldToTalk, MicUnavailableError } from "../voice/holdToTalk";

/** Recordings shorter than this are treated as a tap: the game opens the text box instead. */
export const MIN_RECORDING_MS = 300;

/** T toggles this: SPACE opens the text box directly, without touching the mic (the on-stage escape hatch). */
export const voiceMode = { textMode: false };

export type HoldResult =
  | { kind: "audio"; blob: Blob; ms: number }
  | { kind: "text"; reason: "short" | "mic"; error?: unknown };

/**
 * Wraps the voice lane's holdToTalk for a key: begin() on keydown, end() on keyup. end() may run before
 * the mic has started (a quick tap), so it waits for start() first. The recorded length counts from
 * when the recorder actually started.
 */
class PushToTalk {
  private rec = createHoldToTalk();
  private starting: Promise<void> | null = null;
  private startedAt: number | null = null;
  private error: unknown = null;

  get active() {
    return this.starting !== null;
  }

  begin() {
    if (this.starting) return;
    this.startedAt = null;
    this.error = null;
    this.starting = this.rec.start().then(
      () => {
        this.startedAt = performance.now();
      },
      (e) => {
        this.error = e;
      },
    );
  }

  async end(): Promise<HoldResult> {
    const releasedAt = performance.now();
    const starting = this.starting;
    if (!starting) return { kind: "text", reason: "short" };
    await starting;
    this.starting = null;
    if (this.error || this.startedAt === null) {
      const error = this.error;
      if (!(error instanceof MicUnavailableError)) console.warn("[backpack] recording failed", error);
      return { kind: "text", reason: "mic", error };
    }
    const ms = Math.max(0, releasedAt - this.startedAt);
    const blob = await this.rec.stop();
    if (ms < MIN_RECORDING_MS || blob.size === 0) return { kind: "text", reason: "short" };
    return { kind: "audio", blob, ms };
  }

  /** Drops a recording in progress (scene change). */
  cancel() {
    if (!this.starting) return;
    void this.end().catch(() => {});
  }
}

export const pushToTalk = new PushToTalk();
