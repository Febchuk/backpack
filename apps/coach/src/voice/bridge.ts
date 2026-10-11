import crypto from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { elLanguage } from "@backpack/shared/coach";
import type { Deps } from "../app";
import type { Recall } from "../coach/contract";
import type { Agent, Learner } from "../db/repo";
import { parseDialFormat, parseElevenLabsFormat, transcode, type AudioFormat } from "./codec";
import { createElevenLabsConnector, type AgentConnection, type AgentConnector, type ElevenLabsEvent } from "./elevenlabs";
import { buildCallPrompt } from "./callPrompt";
import { DEMO_CALL } from "../demo/script";
import { runCallTool } from "./tools";

/** Dial appends the call id: `wss://<PUBLIC_HOST>/dial/voice/<call_id>`. */
export const VOICE_PATH = "/dial/voice";
const END_MARK = "coach-goodbye-played";
const MAX_SIGNATURE_AGE_S = 300;

export interface VoiceBridgeOptions {
  /** Injected by tests; defaults to the real ElevenLabs socket. */
  connectAgent?: AgentConnector;
  /** How long a dropped Dial socket may take to reconnect before the call is finalized. */
  reconnectGraceMs?: number;
  /** After ElevenLabs hangs up, how long to wait for the goodbye `mark` echo before sending `end_call`. */
  goodbyeTimeoutMs?: number;
}

export interface VoiceBridge {
  /** Live calls, for tests and diagnostics. */
  activeCalls(): string[];
  close(): void;
}

type Turn = { speaker: "agent" | "learner"; text: string };

interface CallSession {
  callId: string;
  agent: Agent;
  learner: Learner;
  dial: WebSocket | null;
  conv: AgentConnection;
  dialIn: AudioFormat;
  dialOut: AudioFormat;
  /** ElevenLabs formats, known once `conversation_initiation_metadata` arrives. Caller audio before that is dropped. */
  agentIn?: AudioFormat;
  agentOut?: AudioFormat;
  turns: Turn[];
  /** Audio events at or below the last interruption's event id are stale and dropped. */
  lastInterruptId: number;
  agentClosed: boolean;
  endCallSent: boolean;
  finalized: boolean;
  timers: Set<NodeJS.Timeout>;
}

type CallConnected = {
  type: "call_connected";
  call_id?: string;
  direction?: string;
  from?: string;
  to?: string;
  formats?: { inbound?: string; outbound?: string };
  reconnect?: boolean;
};

type DialFrame =
  | CallConnected
  | { type: "media"; payload?: string }
  | { type: "ping_pong"; timestamp?: number }
  | { type: "mark"; name?: string }
  | { type: "duration_warning"; seconds_remaining?: number }
  | { type: "call_ended"; reason?: string }
  | { type: "dtmf"; digit?: string };

/** Dial signs the upgrade with `X-Dial-Signature: t=<s>,v1=<hex>`, the HMAC-SHA256 of `<t>.<call_id>`. */
export function verifyCallSignature(secret: string, header: string | undefined, callId: string, nowS = Date.now() / 1000) {
  if (!header) return false;
  let t: string | undefined;
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1s.length === 0) return false;
  if (Math.abs(nowS - Number(t)) > MAX_SIGNATURE_AGE_S) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${callId}`).digest();
  return v1s.some((v) => {
    if (!/^[0-9a-f]+$/i.test(v)) return false;
    const got = Buffer.from(v, "hex");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

function reject(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

const sendJson = (ws: WebSocket | null, msg: unknown) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Dial self-hosted audio ⇄ the ElevenLabs agent of the coach agent that owns the Dial number on the call
 * (`to` on inbound, `from` on outbound), with the learner's memory in the prompt override. Client tools run
 * in-process for the learner; the transcript becomes a `call` event at call end. Attach to the Express server.
 */
export function attachVoiceBridge(server: Server, deps: Deps, opts: VoiceBridgeOptions = {}): VoiceBridge {
  let connectAgent: AgentConnector | null = opts.connectAgent ?? null;
  if (!connectAgent) {
    try {
      connectAgent = createElevenLabsConnector(deps.config);
    } catch (e) {
      console.warn(`[voice] calls disabled: ${errMsg(e)}. Every call will be hung up.`);
    }
  }
  const graceMs = opts.reconnectGraceMs ?? 20_000;
  const goodbyeMs = opts.goodbyeTimeoutMs ?? 10_000;
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<string, CallSession>();
  const starting = new Map<string, Promise<CallSession | null>>();
  const finished = new Set<string>();
  let shuttingDown = false;

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (!path.startsWith(`${VOICE_PATH}/`)) return reject(socket, "404 Not Found");
    const callId = decodeURIComponent(path.slice(VOICE_PATH.length + 1));
    if (!callId || callId.includes("/")) return reject(socket, "404 Not Found");
    const secret = deps.config.dialSelfHostedSecret;
    const sig = req.headers["x-dial-signature"];
    if (!secret || !verifyCallSignature(secret, Array.isArray(sig) ? sig[0] : sig, callId)) {
      console.warn(`[voice] rejected unsigned or badly signed connection for ${callId}${secret ? "" : " (DIAL_SELF_HOSTED_SECRET is not set)"}`);
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
    s.conv.close();
    if (s.dial && s.dial.readyState === WebSocket.OPEN) s.dial.close(1000);
    console.log(`[voice] ${s.callId} ended (${reason}), ${s.turns.length} turns`);
    if (s.turns.length) void storeTranscript(s);
    if (s.turns.length && deps.engine.afterCall) {
      deps.engine.afterCall(s.agent, s.learner, s.callId).catch((e) => console.error(`[voice] ${s.callId} follow-up failed:`, errMsg(e)));
    }
  }

  async function storeTranscript(s: CallSession) {
    try {
      const text = s.turns.map((t) => `${t.speaker === "agent" ? "Agent" : "Learner"}: ${t.text}`).join("\n");
      const ev = await deps.repo.addEvent({ learner_id: s.learner.id, channel: "call", direction: "in", text, dial_id: s.callId });
      if (ev) void deps.memory.remember(s.learner.id, ev.id).catch((e) => console.error(`[voice] ${s.callId} remember failed:`, errMsg(e)));
    } catch (e) {
      console.error(`[voice] ${s.callId} could not store the transcript:`, errMsg(e));
    }
  }

  function sendEndCall(s: CallSession) {
    if (s.endCallSent) return;
    s.endCallSent = true;
    sendJson(s.dial, { type: "end_call" });
  }

  async function onToolCall(s: CallSession, call: Extract<ElevenLabsEvent, { type: "client_tool_call" }>["client_tool_call"]) {
    const out = await runCallTool(deps.memory, s.learner.id, call.tool_name, call.parameters ?? {});
    console.log(`[voice] ${s.callId} tool ${call.tool_name}: ${out.ok ? "ok" : out.error}`);
    if (call.expects_response === false || s.finalized) return;
    s.conv.send({
      type: "client_tool_result",
      tool_call_id: call.tool_call_id,
      result: out.ok ? out.result : out.error,
      is_error: !out.ok,
    });
  }

  function onAgentEvent(s: CallSession, ev: ElevenLabsEvent) {
    switch (ev.type) {
      case "conversation_initiation_metadata": {
        const m = ev.conversation_initiation_metadata_event;
        try {
          s.agentIn = parseElevenLabsFormat(m.user_input_audio_format ?? "pcm_16000");
          s.agentOut = parseElevenLabsFormat(m.agent_output_audio_format ?? "pcm_16000");
        } catch (e) {
          console.error(`[voice] ${s.callId}:`, errMsg(e));
          s.conv.close();
        }
        return;
      }
      case "audio": {
        const id = ev.audio_event.event_id ?? Number.MAX_SAFE_INTEGER;
        if (!s.agentOut || id <= s.lastInterruptId) return;
        const audio = transcode(Buffer.from(ev.audio_event.audio_base_64, "base64"), s.agentOut, s.dialOut);
        sendJson(s.dial, { type: "media", payload: audio.toString("base64") });
        return;
      }
      case "interruption":
        s.lastInterruptId = Math.max(s.lastInterruptId, ev.interruption_event?.event_id ?? 0);
        sendJson(s.dial, { type: "clear" });
        return;
      case "ping":
        s.conv.send({ type: "pong", event_id: ev.ping_event.event_id });
        return;
      case "user_transcript": {
        const text = ev.user_transcription_event.user_transcript?.trim();
        if (text) s.turns.push({ speaker: "learner", text });
        return;
      }
      case "agent_response": {
        const text = ev.agent_response_event.agent_response?.trim();
        if (text) s.turns.push({ speaker: "agent", text });
        return;
      }
      case "agent_response_correction": {
        // On barge-in ElevenLabs reports what was actually heard; keep the transcript truthful.
        const { original_agent_response: from, corrected_agent_response: to } = ev.agent_response_correction_event;
        const turn = [...s.turns].reverse().find((t) => t.speaker === "agent" && t.text === from?.trim());
        if (turn && to !== undefined) turn.text = to.trim();
        return;
      }
      case "client_tool_call":
        void onToolCall(s, ev.client_tool_call);
        return;
      default:
        return;
    }
  }

  /** Resolves the agent and learner, then opens the ElevenLabs conversation. Null when the call must be refused. */
  async function startSession(callId: string, dial: WebSocket, frame: CallConnected): Promise<CallSession | null> {
    const outbound = frame.direction === "outbound";
    const agentNumber = outbound ? frame.from : frame.to;
    const learnerPhone = outbound ? frame.to : frame.from;
    if (!connectAgent) {
      console.error(`[voice] ${callId} refused: ELEVENLABS_API_KEY is not set`);
      return null;
    }
    const agent = agentNumber ? await deps.repo.agentByNumber(agentNumber) : null;
    if (!agent?.el_agent_id) {
      console.warn(`[voice] ${callId} refused: ${agent ? `agent ${agent.id} has no ElevenLabs agent` : `no agent owns ${agentNumber ?? "(no number)"}`}`);
      return null;
    }
    if (!learnerPhone) {
      console.warn(`[voice] ${callId} refused: no caller number`);
      return null;
    }
    const { learner, created } = await deps.repo.upsertLearner(agent.id, learnerPhone);
    if (created) console.log(`[voice] ${callId} registered learner ${learner.id} for agent ${agent.id}`);
    let recall: Recall = { facts: [], memories: [], struggles: [] };
    try {
      recall = await deps.memory.recall(learner.id, "phone call");
    } catch (e) {
      console.error(`[voice] ${callId} recall failed:`, errMsg(e));
    }
    if (shuttingDown) return null;

    const conv = connectAgent(callId, agent.el_agent_id);
    const s: CallSession = {
      callId,
      agent,
      learner,
      dial,
      conv,
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
    conv.onMessage((ev) => onAgentEvent(s, ev));
    conv.onClose((reason) => {
      if (s.agentClosed || s.finalized) return;
      s.agentClosed = true;
      console.log(`[voice] ${callId} agent closed (${reason})`);
      // Let the goodbye finish playing, then hang up; Dial answers with call_ended.
      sendJson(s.dial, { type: "mark", name: END_MARK });
      later(s, goodbyeMs, () => sendEndCall(s));
    });
    const { prompt, firstMessage } = deps.config.demo ? DEMO_CALL : buildCallPrompt(agent, learner, recall);
    conv.send({
      type: "conversation_initiation_client_data",
      conversation_config_override: {
        agent: { prompt: { prompt }, first_message: firstMessage, language: elLanguage(agent.language) },
        ...(agent.voice_id ? { tts: { voice_id: agent.voice_id } } : {}),
      },
    });
    console.log(`[voice] ${callId} ${outbound ? "outbound" : "inbound"} call: agent ${agent.id}, learner ${learner.id}`);
    return s;
  }

  function onDialSocket(ws: WebSocket, callId: string) {
    let s: CallSession | null = null;
    let pending: Promise<CallSession | null> | null = null;

    const refuse = () => {
      sendJson(ws, { type: "end_call" });
      ws.close(1000);
    };

    const attach = (existing: CallSession) => {
      // Dial reconnected mid-call: keep the ElevenLabs conversation and transcript, swap the socket.
      clearTimers(existing);
      if (existing.dial && existing.dial !== ws) existing.dial.terminate();
      existing.dial = ws;
      s = existing;
      console.log(`[voice] ${callId} Dial reconnected`);
      if (existing.agentClosed) sendEndCall(existing);
    };

    const onConnected = (frame: CallConnected) => {
      if (s || pending) return;
      if (frame.call_id && frame.call_id !== callId) return ws.close(1008, "call id mismatch");
      const existing = sessions.get(callId);
      if (existing) return attach(existing);
      const inFlight = starting.get(callId);
      if (inFlight) {
        pending = inFlight.then((cur) => {
          if (cur && !cur.finalized) attach(cur);
          else refuse();
          return cur;
        });
        return;
      }
      const p = startSession(callId, ws, frame).catch((e) => {
        console.error(`[voice] ${callId} could not start:`, errMsg(e));
        return null;
      });
      starting.set(callId, p);
      pending = p.then((cur) => {
        starting.delete(callId);
        if (!cur) refuse();
        else if (cur.dial === ws) {
          s = cur;
          if (ws.readyState !== WebSocket.OPEN) {
            cur.dial = null;
            later(cur, graceMs, () => finalize(cur, "dial_disconnected"));
          }
        }
        return cur;
      });
    };

    const onFrame = (frame: DialFrame) => {
      const cur = s;
      if (!cur || cur.dial !== ws) return;
      switch (frame.type) {
        case "media":
          if (cur.agentIn && frame.payload && !cur.agentClosed) {
            const audio = transcode(Buffer.from(frame.payload, "base64"), cur.dialIn, cur.agentIn);
            cur.conv.send({ user_audio_chunk: audio.toString("base64") });
          }
          return;
        case "mark":
          if (frame.name === END_MARK) sendEndCall(cur);
          return;
        case "duration_warning":
          cur.conv.send({
            type: "contextual_update",
            text: `The call will be cut in about ${frame.seconds_remaining ?? 30} seconds. Wrap up now: say your goodbye in one short sentence, then end the call.`,
          });
          return;
        case "call_ended":
          finalize(cur, frame.reason ?? "call_ended");
          return;
        default:
          return;
      }
    };

    ws.on("message", (data) => {
      let frame: DialFrame;
      try {
        frame = JSON.parse(data.toString()) as DialFrame;
      } catch {
        return;
      }
      if (frame.type === "ping_pong") return sendJson(ws, frame);
      if (frame.type === "call_connected") return onConnected(frame);
      // Audio before the session is ready is dropped; control frames wait for it.
      if (!s && pending && frame.type !== "media") void pending.then(() => onFrame(frame));
      else onFrame(frame);
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
    activeCalls: () => [...sessions.keys()],
    close() {
      shuttingDown = true;
      server.off("upgrade", onUpgrade);
      for (const s of [...sessions.values()]) finalize(s, "server_shutdown");
      wss.close();
    },
  };
}
