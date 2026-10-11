import type { Server } from "node:http";
import type { Deps } from "../app";
import type { AgentConnector } from "./elevenlabs";

/** Dial appends the call id: `wss://<PUBLIC_HOST>/dial/voice/<call_id>`. */
export const VOICE_PATH = "/dial/voice";

export interface VoiceBridgeOptions {
  /** Injected by tests; defaults to the real ElevenLabs socket. */
  connectAgent?: AgentConnector;
  /** How long a dropped Dial socket may take to reconnect before the call is finalized. */
  reconnectGraceMs?: number;
  /** After ElevenLabs hangs up, how long to wait for the goodbye `mark` echo before sending `end_call`. */
  goodbyeTimeoutMs?: number;
}

export interface VoiceBridge {
  close(): void;
}

/**
 * Lane D: Dial self-hosted audio ⇄ the ElevenLabs agent of the coach agent that owns the Dial number on the call
 * (`to` on inbound, `from` on outbound), with the learner's memory in the prompt override.
 */
export function attachVoiceBridge(_server: Server, _deps: Deps, _opts: VoiceBridgeOptions = {}): VoiceBridge {
  console.warn("[coach] voice bridge not implemented yet (lane D)");
  return { close() {} };
}
