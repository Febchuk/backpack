import { WebSocket } from "ws";
import type { Config } from "../config";

export const ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/convai/conversation";

/** One ElevenLabs Agents conversation, as the bridge sees it. JSON messages both ways. */
export interface AgentConnection {
  send(msg: Record<string, unknown>): void;
  onMessage(cb: (msg: ElevenLabsEvent) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(): void;
}

/** Opens a conversation with one ElevenLabs agent (each coach agent has its own `el_agent_id`). */
export type AgentConnector = (callId: string, elAgentId: string) => AgentConnection;

/** The server → client events the bridge reads (ElevenLabs Agents WebSocket API); others are ignored. */
export type ElevenLabsEvent =
  | {
      type: "conversation_initiation_metadata";
      conversation_initiation_metadata_event: {
        conversation_id?: string;
        agent_output_audio_format?: string;
        user_input_audio_format?: string;
      };
    }
  | { type: "audio"; audio_event: { audio_base_64: string; event_id?: number } }
  | { type: "interruption"; interruption_event?: { event_id?: number } }
  | { type: "ping"; ping_event: { event_id: number; ping_ms?: number } }
  | { type: "user_transcript"; user_transcription_event: { user_transcript?: string } }
  | { type: "agent_response"; agent_response_event: { agent_response?: string } }
  | {
      type: "agent_response_correction";
      agent_response_correction_event: { original_agent_response?: string; corrected_agent_response?: string };
    }
  | {
      type: "client_tool_call";
      client_tool_call: { tool_name: string; tool_call_id: string; parameters?: Record<string, unknown>; expects_response?: boolean };
    }
  | { type: "agent_tool_response" | "vad_score" | "agent_response_metadata" | "client_error" | "internal_tentative_agent_response" };

/**
 * Opens a real ElevenLabs Agents conversation. Server-side, so the key rides in the `xi-api-key` header
 * (no signed-URL round trip). Messages sent before the socket opens are queued.
 */
export function createElevenLabsConnector(config: Config): AgentConnector {
  const apiKey = config.elevenLabsApiKey;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  return (_callId, agentId) => {
    const ws = new WebSocket(`${ELEVENLABS_WS_URL}?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { "xi-api-key": apiKey },
    });
    const queue: string[] = [];
    let closeCb: (reason: string) => void = () => {};
    let closed = false;
    const fireClose = (reason: string) => {
      if (closed) return;
      closed = true;
      closeCb(reason);
    };
    ws.on("open", () => {
      for (const m of queue.splice(0)) ws.send(m);
    });
    ws.on("error", (e) => {
      console.error("[voice:elevenlabs] socket error:", e.message);
      fireClose("error");
    });
    ws.on("close", (code) => fireClose(`closed ${code}`));
    return {
      send(msg) {
        const s = JSON.stringify(msg);
        if (ws.readyState === WebSocket.OPEN) ws.send(s);
        else if (ws.readyState === WebSocket.CONNECTING) queue.push(s);
      },
      onMessage(cb) {
        ws.on("message", (data) => {
          try {
            cb(JSON.parse(data.toString()) as ElevenLabsEvent);
          } catch {
            /* not JSON: ignore */
          }
        });
      },
      onClose(cb) {
        closeCb = cb;
      },
      close() {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
      },
    };
  };
}
