import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Deps } from "../app";
import { gradeTranscript, verifyDialSignature } from "../routes/dialWebhook";
import { runLunaTool } from "../mcp/tools";
import { parseDialFormat, parseElevenLabsFormat, transcode, type AudioFormat } from "./codec";
import { createElevenLabsConnector, type AgentConnection, type AgentConnector, type ElevenLabsEvent } from "./elevenlabs";
import { lunaCallSetup, lunaTtsOverride, type PlacedCall } from "./prompt";

/** Dial appends the call id to the configured wsUrl: `wss://<PUBLIC_HOST>/dial/voice/<call_id>`. */
export const VOICE_PATH = "/dial/voice";
const END_MARK = "luna-goodbye-played";

export interface VoiceBridgeOptions {
  /** Opens the ElevenLabs conversation. Injected by tests; defaults to the real ElevenLabs socket. */
  connectAgent?: AgentConnector;
  /** How long a dropped Dial socket may take to reconnect before the call is finalized (Dial retries ~15 s). */
  reconnectGraceMs?: number;
  /** After ElevenLabs hangs up, how long to wait for the goodbye `mark` echo before sending `end_call`. */
  goodbyeTimeoutMs?: number;
  /**
   * Send `tts.speed` (slower for level-1 players). Needs the agent's "Voice speed" override toggle, or ElevenLabs
   * rejects the conversation, so it is off unless ELEVENLABS_SPEED_OVERRIDE=1.
   */
  speedOverride?: boolean;
}

type Turn = { speaker: "luna" | "player"; text: string };

interface CallSession {
  callId: string;
  placed: PlacedCall | null;
  dial: WebSocket | null;
  agent: AgentConnection;
  dialIn: AudioFormat;
  dialOut: AudioFormat;
  /** ElevenLabs formats, known once `conversation_initiation_metadata` arrives. Caller audio before that is dropped. */
  agentIn?: AudioFormat;
  agentOut?: AudioFormat;
  conversationId?: string;
  turns: Turn[];
  /** Audio events at or below the last interruption's event id are stale and dropped. */
  lastInterruptId: number;
  agentClosed: boolean;
  endCallSent: boolean;
  finalized: boolean;
  timers: Set<NodeJS.Timeout>;
}

type DialFrame =
  | {
      type: "call_connected";
      call_id?: string;
      direction?: string;
      from?: string;
      to?: string;
      formats?: { inbound?: string; outbound?: string };
      reconnect?: boolean;
    }
  | { type: "media"; payload?: string }
  | { type: "ping_pong"; timestamp?: number }
  | { type: "mark"; name?: string }
  | { type: "duration_warning"; seconds_remaining?: number }
  | { type: "call_ended"; reason?: string }
  | { type: "dtmf"; digit?: string };

function reject(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

const sendJson = (ws: WebSocket | null, msg: unknown) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

/**
 * Dial Self-Hosted AUDIO mode: bridges each call's raw audio to an ElevenLabs Agents conversation that voices
 * Luna with a native French voice. Tools run in-process as ElevenLabs client tools; the transcript is graded at
 * call end like a Dial `call.transcribed` webhook. Attach to the same HTTP server as the Express app.
 */
export function attachVoiceBridge(server: Server, deps: Deps, opts: VoiceBridgeOptions = {}) {
  const connectAgent = opts.connectAgent ?? createElevenLabsConnector(deps.config);
  const graceMs = opts.reconnectGraceMs ?? 20_000;
  const goodbyeMs = opts.goodbyeTimeoutMs ?? 10_000;
  const speedOverride = opts.speedOverride ?? process.env.ELEVENLABS_SPEED_OVERRIDE === "1";
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<string, CallSession>();
  const finished = new Set<string>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (!path.startsWith(`${VOICE_PATH}/`)) return reject(socket, "404 Not Found");
    const callId = decodeURIComponent(path.slice(VOICE_PATH.length + 1));
    if (!callId || callId.includes("/")) return reject(socket, "404 Not Found");
    const secret = deps.config.dialSelfHostedSecret;
    const sig = req.headers["x-dial-signature"];
    if (!secret || !verifyDialSignature(secret, Array.isArray(sig) ? sig[0] : sig, callId)) {
      console.warn(`[voice] rejected unsigned or badly signed connection for ${callId}`);
      return reject(socket, "401 Unauthorized");
    }
    if (finished.has(callId)) return reject(socket, "410 Gone");
    wss.handleUpgrade(req, socket, head, (ws) => onDialSocket(ws, callId));
  };
  server.on("upgrade", onUpgrade);

  function later(s: CallSession, ms: number, fn: () => void) {
    const t = setTimeout(() => {
      s.timers.delete(t);
      fn();
    }, ms);
    s.timers.add(t);
  }

  function clearTimers(s: CallSession) {
    for (const t of s.timers) clearTimeout(t);
    s.timers.clear();
  }

  function finalize(s: CallSession, reason: string) {
    if (s.finalized) return;
    s.finalized = true;
    clearTimers(s);
    sessions.delete(s.callId);
    finished.add(s.callId);
    s.agent.close();
    if (s.dial && s.dial.readyState === WebSocket.OPEN) s.dial.close(1000);
    console.log(`[voice] ${s.callId} ended (${reason}), ${s.turns.length} turns`);
    if (!s.placed) return;
    try {
      gradeTranscript(
        deps,
        { call_id: s.callId, player_id: s.placed.player_id, kind: s.placed.kind, turns: s.turns },
        { voice: "selfhosted", end_reason: reason, ...(s.conversationId ? { conversation_id: s.conversationId } : {}) },
      );
    } catch (e) {
      console.error(`[voice] grading ${s.callId} failed:`, e instanceof Error ? e.message : e);
    }
  }

  function sendEndCall(s: CallSession) {
    if (s.endCallSent) return;
    s.endCallSent = true;
    sendJson(s.dial, { type: "end_call" });
  }

  function onAgentEvent(s: CallSession, ev: ElevenLabsEvent) {
    switch (ev.type) {
      case "conversation_initiation_metadata": {
        const m = ev.conversation_initiation_metadata_event;
        s.conversationId = m.conversation_id;
        try {
          s.agentIn = parseElevenLabsFormat(m.user_input_audio_format ?? "pcm_16000");
          s.agentOut = parseElevenLabsFormat(m.agent_output_audio_format ?? "pcm_16000");
        } catch (e) {
          console.error(`[voice] ${s.callId}:`, e instanceof Error ? e.message : e);
          s.agent.close();
        }
        return;
      }
      case "audio": {
        const id = ev.audio_event.event_id ?? Number.MAX_SAFE_INTEGER;
        if (!s.agentOut || id <= s.lastInterruptId) return;
        const pcm = transcode(Buffer.from(ev.audio_event.audio_base_64, "base64"), s.agentOut, s.dialOut);
        sendJson(s.dial, { type: "media", payload: pcm.toString("base64") });
        return;
      }
      case "interruption":
        s.lastInterruptId = Math.max(s.lastInterruptId, ev.interruption_event?.event_id ?? 0);
        sendJson(s.dial, { type: "clear" });
        return;
      case "ping":
        s.agent.send({ type: "pong", event_id: ev.ping_event.event_id });
        return;
      case "user_transcript": {
        const text = ev.user_transcription_event.user_transcript?.trim();
        if (text) s.turns.push({ speaker: "player", text });
        return;
      }
      case "agent_response": {
        const text = ev.agent_response_event.agent_response?.trim();
        if (text) s.turns.push({ speaker: "luna", text });
        return;
      }
      case "agent_response_correction": {
        // On barge-in ElevenLabs reports what was actually heard; keep the transcript truthful.
        const { original_agent_response: from, corrected_agent_response: to } = ev.agent_response_correction_event;
        const turn = [...s.turns].reverse().find((t) => t.speaker === "luna" && t.text === from?.trim());
        if (turn && to !== undefined) turn.text = to.trim();
        return;
      }
      case "client_tool_call": {
        const call = ev.client_tool_call;
        const out = s.placed
          ? runLunaTool(deps.repo, s.placed.player_id, call.tool_name, call.parameters ?? {})
          : ({ ok: false, error: "no player is linked to this call" } as const);
        console.log(`[voice] ${s.callId} tool ${call.tool_name}: ${out.ok ? "ok" : out.error}`);
        if (call.expects_response === false) return;
        s.agent.send({
          type: "client_tool_result",
          tool_call_id: call.tool_call_id,
          result: JSON.stringify(out.ok ? out.data : { error: out.error }),
          is_error: !out.ok,
        });
        return;
      }
      default:
        return;
    }
  }

  function startSession(callId: string, dial: WebSocket, frame: Extract<DialFrame, { type: "call_connected" }>): CallSession {
    const placed = deps.repo.findPlacedCall(callId);
    const agent = connectAgent(callId);
    const s: CallSession = {
      callId,
      placed,
      dial,
      agent,
      dialIn: parseDialFormat(frame.formats?.inbound ?? "mulaw_8000"),
      dialOut: parseDialFormat(frame.formats?.outbound ?? "mulaw_8000"),
      turns: [],
      lastInterruptId: -1,
      agentClosed: false,
      endCallSent: false,
      finalized: false,
      timers: new Set(),
    };
    sessions.set(callId, s);
    const { prompt, firstMessage } = lunaCallSetup(deps.repo, placed);
    const level = placed ? deps.repo.getState(placed.player_id)?.player.level : undefined;
    const tts = lunaTtsOverride({ voiceId: deps.config.elevenLabsVoiceId, level, speedOverride });
    agent.onMessage((ev) => onAgentEvent(s, ev));
    agent.onClose((reason) => {
      if (s.agentClosed || s.finalized) return;
      s.agentClosed = true;
      console.log(`[voice] ${callId} agent closed (${reason})`);
      // Let the goodbye finish playing, then hang up; Dial answers with call_ended.
      sendJson(s.dial, { type: "mark", name: END_MARK });
      later(s, goodbyeMs, () => sendEndCall(s));
    });
    agent.send({
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: { prompt: { prompt }, first_message: firstMessage, language: "fr" },
        ...(tts ? { tts } : {}),
      },
    });
    console.log(`[voice] ${callId} connected (${placed ? placed.kind : "unknown call"})`);
    return s;
  }

  function onDialSocket(ws: WebSocket, callId: string) {
    let s: CallSession | null = null;

    ws.on("message", (data) => {
      let frame: DialFrame;
      try {
        frame = JSON.parse(data.toString()) as DialFrame;
      } catch {
        return;
      }
      if (frame.type === "ping_pong") return sendJson(ws, frame);
      if (frame.type === "call_connected") {
        if (s) return;
        if (frame.call_id && frame.call_id !== callId) return ws.close(1008, "call id mismatch");
        const existing = sessions.get(callId);
        if (existing) {
          // Dial reconnected mid-call: keep the ElevenLabs conversation and transcript, swap the socket.
          clearTimers(existing);
          if (existing.dial && existing.dial !== ws) existing.dial.terminate();
          existing.dial = ws;
          s = existing;
          console.log(`[voice] ${callId} Dial reconnected`);
          if (s.agentClosed) sendEndCall(s);
          return;
        }
        try {
          s = startSession(callId, ws, frame);
        } catch (e) {
          console.error(`[voice] ${callId} could not start:`, e instanceof Error ? e.message : e);
          sendJson(ws, { type: "end_call" });
          ws.close(1011);
        }
        return;
      }
      if (!s || s.dial !== ws) return;
      switch (frame.type) {
        case "media":
          if (s.agentIn && frame.payload && !s.agentClosed) {
            const audio = transcode(Buffer.from(frame.payload, "base64"), s.dialIn, s.agentIn);
            s.agent.send({ user_audio_chunk: audio.toString("base64") });
          }
          return;
        case "mark":
          if (frame.name === END_MARK) sendEndCall(s);
          return;
        case "duration_warning":
          s.agent.send({
            type: "contextual_update",
            text: `The call will be cut in about ${frame.seconds_remaining ?? 30} seconds. Wrap up now: say your goodbye in one short sentence, then end the call.`,
          });
          return;
        case "call_ended":
          finalize(s, frame.reason ?? "call_ended");
          return;
        default:
          return;
      }
    });

    ws.on("close", () => {
      const cur = s;
      if (!cur || cur.finalized || cur.dial !== ws) return;
      cur.dial = null;
      if (cur.endCallSent) return finalize(cur, "customer_hangup");
      // Dial reconnects a dropped socket for ~15 s; keep the agent alive until then.
      later(cur, graceMs, () => finalize(cur, "dial_disconnected"));
    });
    ws.on("error", (e) => console.error(`[voice] ${callId} Dial socket error:`, e.message));
  }

  return {
    /** Live calls, for tests and diagnostics. */
    activeCalls: () => [...sessions.keys()],
    close() {
      server.off("upgrade", onUpgrade);
      for (const s of [...sessions.values()]) finalize(s, "server_shutdown");
      wss.close();
    },
  };
}

export type VoiceBridge = ReturnType<typeof attachVoiceBridge>;
