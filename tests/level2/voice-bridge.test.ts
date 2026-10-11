import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { PlayerState } from "@backpack/shared";
import { loadConfig } from "../../apps/server/src/config";
import { createApp, createDeps, type Deps } from "../../apps/server/src/app";
import { attachVoiceBridge, WebSocket, type AgentConnection, type ElevenLabsEvent, type VoiceBridge } from "../../apps/server/src/voice";
import { recordingDial } from "../helpers/fakes";

const SECRET = "dial_sh_test_secret";
const PHONE = "+15550001111";
const PHRASE = "Je voudrais un café";

/** A scripted stand-in for one ElevenLabs conversation. */
interface FakeConversation extends AgentConnection {
  callId: string;
  sent: Record<string, unknown>[];
  closed: boolean;
  emit(ev: ElevenLabsEvent): void;
  hangUp(): void;
}

function fakeElevenLabs() {
  const conversations: FakeConversation[] = [];
  const connect = (callId: string): AgentConnection => {
    const handlers: ((ev: ElevenLabsEvent) => void)[] = [];
    let onClose: (reason: string) => void = () => {};
    const c: FakeConversation = {
      callId,
      sent: [],
      closed: false,
      send: (m) => void c.sent.push(m),
      onMessage: (cb) => void handlers.push(cb),
      onClose: (cb) => void (onClose = cb),
      close: () => void (c.closed = true),
      emit: (ev) => handlers.forEach((h) => h(ev)),
      hangUp: () => onClose("closed 1000"),
    };
    conversations.push(c);
    return c;
  };
  return { connect, conversations };
}

let deps: Deps;
let server: Server;
let bridge: VoiceBridge;
let base: string;
let el: ReturnType<typeof fakeElevenLabs>;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  el = fakeElevenLabs();
  deps = createDeps(
    loadConfig({
      dbPath: ":memory:",
      mockGemini: true,
      mockDial: true,
      isProduction: false,
      voiceMode: "selfhosted",
      dialSelfHostedSecret: SECRET,
      elevenLabsVoiceId: "voice_fr_1",
    }),
    { dial: recordingDial().adapter },
  );
  server = await new Promise((resolve) => {
    const s = createApp(deps).listen(0, () => resolve(s));
  });
  bridge = attachVoiceBridge(server, deps, { connectAgent: el.connect, reconnectGraceMs: 100, goodbyeTimeoutMs: 2_000 });
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  bridge.close();
  await new Promise<void>((r) => server.close(() => r()));
});

const post = (path: string, body: unknown = {}) =>
  fetch(`http://${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const state = async (id: string) => PlayerState.parse(await (await fetch(`http://${base}/state/${id}`)).json());

function sign(callId: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${callId}`).digest("hex")}`;
}

async function waitFor<T>(fn: () => T | undefined | false, ms = 2_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A fake Dial: opens the signed socket for a call and records every frame the bridge sends back. */
async function dialConnect(callId: string, signature: string | null = sign(callId)) {
  const ws = new WebSocket(`ws://${base}/dial/voice/${callId}`, { headers: signature ? { "x-dial-signature": signature } : {} });
  sockets.push(ws);
  const received: Record<string, any>[] = [];
  ws.on("message", (d) => received.push(JSON.parse(d.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, received, send };
}

const connected = (callId: string, formats = { inbound: "mulaw_8000", outbound: "mulaw_8000" }, reconnect = false) => ({
  type: "call_connected",
  call_id: callId,
  direction: "outbound",
  from: "+15550009999",
  to: PHONE,
  instruction: null,
  language: "fr-FR",
  formats,
  reconnect,
});

const metadata = (input = "ulaw_8000", output = "ulaw_8000"): ElevenLabsEvent => ({
  type: "conversation_initiation_metadata",
  conversation_initiation_metadata_event: { conversation_id: "conv_1", user_input_audio_format: input, agent_output_audio_format: output },
});

async function introCall() {
  const id = PlayerState.parse(await (await post("/players")).json()).player.id;
  const { call_id } = (await (await post("/activate", { player_id: id, phone: PHONE })).json()) as { call_id: string };
  return { id, callId: call_id };
}

async function debriefCall() {
  const { id } = await introCall();
  deps.repo.logTurn(id, [], [PHRASE]);
  const { call_id } = (await (await post("/skip-evening", { player_id: id })).json()) as { call_id: string };
  return { id, callId: call_id };
}

async function startCall(callId: string, formats?: { inbound: string; outbound: string }) {
  const dial = await dialConnect(callId);
  dial.send(connected(callId, formats));
  const conv = await waitFor(() => el.conversations.find((c) => c.callId === callId));
  return { dial, conv };
}

const callEvents = () =>
  (deps.db.prepare("SELECT payload FROM events WHERE source = 'call'").all() as { payload: string }[]).map((r) => JSON.parse(r.payload));

describe("L2.5 voice bridge: Dial self-hosted audio ↔ ElevenLabs (no network)", () => {
  it("rejects connections without a valid Dial signature", async () => {
    const { callId } = await introCall();
    await expect(dialConnect(callId, null)).rejects.toThrow(/401/);
    await expect(dialConnect(callId, sign(callId, "wrong_secret"))).rejects.toThrow(/401/);
    await expect(dialConnect(callId, sign("another_call"))).rejects.toThrow(/401/);
    await expect(dialConnect(callId, sign(callId, SECRET, Math.floor(Date.now() / 1000) - 3600))).rejects.toThrow(/401/);
    expect(el.conversations).toHaveLength(0);
  });

  it("starts Luna's ElevenLabs conversation with the intro prompt, French and the configured voice", async () => {
    const { callId } = await introCall();
    const { dial, conv } = await startCall(callId);
    const init = conv.sent[0] as any;
    expect(init.type).toBe("conversation_initiation_client_data");
    const o = init.conversation_config_override;
    expect(o.agent.language).toBe("fr");
    expect(o.agent.first_message).toBe("Bonjour ! C'est Luna, ton guide à Paris. Je suis une IA.");
    expect(o.agent.prompt.prompt).toMatch(/first call with the player/);
    expect(o.agent.prompt.prompt).toMatch(/Do not say it again/);
    expect(o.tts).toEqual({ voice_id: "voice_fr_1" });

    // Keep-alives both sides.
    dial.send({ type: "ping_pong", timestamp: 1749480000000 });
    await waitFor(() => dial.received.find((m) => m.type === "ping_pong" && m.timestamp === 1749480000000));
    conv.emit({ type: "ping", ping_event: { event_id: 7, ping_ms: 20 } });
    expect(conv.sent).toContainEqual({ type: "pong", event_id: 7 });
  });

  it("passes μ-law through both ways, and turns an ElevenLabs interruption into a Dial clear", async () => {
    const { callId } = await introCall();
    const { dial, conv } = await startCall(callId);

    // Before ElevenLabs reports its formats, caller audio is dropped.
    dial.send({ type: "media", payload: Buffer.alloc(160, 0xff).toString("base64"), seq: 1 });
    dial.send({ type: "ping_pong", timestamp: 1 }); // frames are handled in order: the echo means the media was seen
    await waitFor(() => dial.received.find((m) => m.type === "ping_pong"));
    conv.emit(metadata("ulaw_8000", "ulaw_8000"));
    const caller = Buffer.alloc(160, 0x7e).toString("base64");
    dial.send({ type: "media", payload: caller, seq: 2 });
    await waitFor(() => conv.sent.find((m) => "user_audio_chunk" in m));
    expect(conv.sent.filter((m) => "user_audio_chunk" in m)).toEqual([{ user_audio_chunk: caller }]);

    const luna = Buffer.alloc(320, 0x55).toString("base64");
    conv.emit({ type: "audio", audio_event: { audio_base_64: luna, event_id: 3 } });
    await waitFor(() => dial.received.find((m) => m.type === "media"));
    expect(dial.received.find((m) => m.type === "media")).toEqual({ type: "media", payload: luna });

    conv.emit({ type: "interruption", interruption_event: { event_id: 5 } });
    await waitFor(() => dial.received.find((m) => m.type === "clear"));
    // Stale audio from the interrupted response is dropped; the new response flows.
    conv.emit({ type: "audio", audio_event: { audio_base_64: Buffer.alloc(8, 1).toString("base64"), event_id: 4 } });
    const fresh = Buffer.alloc(8, 2).toString("base64");
    conv.emit({ type: "audio", audio_event: { audio_base_64: fresh, event_id: 6 } });
    await waitFor(() => dial.received.find((m) => m.type === "media" && m.payload === fresh));
    const medias = dial.received.filter((m) => m.type === "media").map((m) => m.payload);
    expect(medias).toEqual([luna, fresh]);
    const clearAt = dial.received.findIndex((m) => m.type === "clear");
    expect(dial.received.findIndex((m) => m.payload === fresh)).toBeGreaterThan(clearAt);
  });

  it("transcodes when ElevenLabs uses pcm_16000: Dial μ-law 8 kHz ↔ PCM16 16 kHz", async () => {
    const { callId } = await introCall();
    const { dial, conv } = await startCall(callId);
    conv.emit(metadata("pcm_16000", "pcm_16000"));
    dial.send({ type: "media", payload: Buffer.alloc(160, 0xff).toString("base64"), seq: 1 }); // 20 ms of μ-law silence
    const chunk = await waitFor(() => conv.sent.find((m) => "user_audio_chunk" in m));
    const pcm = Buffer.from(chunk.user_audio_chunk as string, "base64");
    expect(pcm.length).toBe(640); // 320 samples × 2 bytes
    expect(Math.max(...Array.from({ length: 320 }, (_, i) => Math.abs(pcm.readInt16LE(i * 2))))).toBe(0);

    const out = Buffer.alloc(640); // 20 ms of PCM16 silence at 16 kHz
    conv.emit({ type: "audio", audio_event: { audio_base_64: out.toString("base64"), event_id: 1 } });
    const media = await waitFor(() => dial.received.find((m) => m.type === "media"));
    const mulaw = Buffer.from(media.payload, "base64");
    expect(mulaw.length).toBe(160);
    expect([...mulaw].every((b) => b === 0xff)).toBe(true);
  });

  it("runs client tools in-process for the player on the call", async () => {
    const { id, callId } = await debriefCall();
    const { conv } = await startCall(callId);
    expect((conv.sent[0] as any).conversation_config_override.agent.prompt.prompt).toContain(PHRASE);

    conv.emit({ type: "client_tool_call", client_tool_call: { tool_name: "get_missed_phrases", tool_call_id: "t1", parameters: {}, expects_response: true } });
    conv.emit({
      type: "client_tool_call",
      client_tool_call: { tool_name: "mark_phrase_mastered", tool_call_id: "t2", parameters: { phrase: PHRASE }, expects_response: true },
    });
    conv.emit({
      type: "client_tool_call",
      client_tool_call: { tool_name: "unlock_district", tool_call_id: "t3", parameters: { district: "market" }, expects_response: true },
    });
    conv.emit({
      type: "client_tool_call",
      client_tool_call: { tool_name: "unlock_district", tool_call_id: "t4", parameters: { district: "moon" }, expects_response: true },
    });
    const results = conv.sent.filter((m) => m.type === "client_tool_result") as any[];
    expect(results.map((r) => [r.tool_call_id, r.is_error])).toEqual([
      ["t1", false],
      ["t2", false],
      ["t3", false],
      ["t4", true],
    ]);
    expect(JSON.parse(results[0].result)).toEqual({ phrases: [PHRASE] });

    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === PHRASE)?.status).toBe("mastered");
    expect(st.unlocks).toContain("market");
  });

  it("grades the collected transcript when the call ends, like a Dial transcript", async () => {
    const { id, callId } = await debriefCall();
    const { dial, conv } = await startCall(callId);
    conv.emit({ type: "agent_response", agent_response_event: { agent_response: `Répète : ${PHRASE}. I would like a coffee.` } });
    conv.emit({ type: "user_transcript", user_transcription_event: { user_transcript: "je voudrais un café" } });
    // Barge-in: ElevenLabs corrects the reply to what the player actually heard.
    conv.emit({ type: "agent_response", agent_response_event: { agent_response: "Bravo ! Le marché est ouvert ce soir." } });
    conv.emit({
      type: "agent_response_correction",
      agent_response_correction_event: { original_agent_response: "Bravo ! Le marché est ouvert ce soir.", corrected_agent_response: "Bravo !" },
    });
    dial.send({ type: "call_ended", reason: "caller_hangup" });

    const ev = await waitFor(() => callEvents().find((e) => e.type !== "placed" && e.call_id === callId));
    expect(ev).toMatchObject({
      call_id: callId,
      player_id: id,
      kind: "debrief",
      mastered: [PHRASE],
      voice: "selfhosted",
      end_reason: "caller_hangup",
    });
    expect(ev.turns).toEqual([
      { speaker: "luna", text: `Répète : ${PHRASE}. I would like a coffee.` },
      { speaker: "player", text: "je voudrais un café" },
      { speaker: "luna", text: "Bravo !" },
    ]);
    expect(conv.closed).toBe(true);
    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === PHRASE)?.status).toBe("mastered");
    expect(st.unlocks).toContain("market");
    // Dial may not reconnect to a finished call.
    await expect(dialConnect(callId)).rejects.toThrow(/410/);
  });

  it("when Luna hangs up: marks the goodbye, then end_call once Dial has played it", async () => {
    const { callId } = await introCall();
    const { dial, conv } = await startCall(callId);
    conv.hangUp();
    const mark = await waitFor(() => dial.received.find((m) => m.type === "mark"));
    expect(dial.received.some((m) => m.type === "end_call")).toBe(false);
    dial.send({ type: "mark", name: mark.name });
    await waitFor(() => dial.received.find((m) => m.type === "end_call"));
  });

  it("nudges the agent on duration_warning", async () => {
    const { callId } = await introCall();
    const { dial, conv } = await startCall(callId);
    dial.send({ type: "duration_warning", seconds_remaining: 30 });
    const upd = await waitFor(() => conv.sent.find((m) => m.type === "contextual_update"));
    expect(upd.text).toMatch(/30 seconds/);
  });

  it("keeps the conversation across a Dial reconnect, and finalizes after the grace period otherwise", async () => {
    const { callId } = await introCall();
    const first = await startCall(callId);
    first.conv.emit({ type: "user_transcript", user_transcription_event: { user_transcript: "bonjour" } });
    first.dial.ws.close();
    const again = await dialConnect(callId);
    again.send(connected(callId, undefined, true));
    await new Promise((r) => setTimeout(r, 150));
    expect(el.conversations).toHaveLength(1);
    expect(first.conv.closed).toBe(false);
    expect(bridge.activeCalls()).toEqual([callId]);

    again.ws.close();
    const ev = await waitFor(() => callEvents().find((e) => e.type !== "placed" && e.call_id === callId), 1_000);
    expect(ev).toMatchObject({ kind: "intro", end_reason: "dial_disconnected", turns: [{ speaker: "player", text: "bonjour" }] });
    expect(first.conv.closed).toBe(true);
  });
});
