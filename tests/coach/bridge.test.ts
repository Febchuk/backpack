// Lane D gate: one self-hosted bridge serves every agent, picked by the Dial number on the call.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { WebSocket } from "ws";
import { attachVoiceBridge, type VoiceBridge } from "../../apps/coach/src/voice/bridge";
import type { AgentConnection, ElevenLabsEvent } from "../../apps/coach/src/voice/elevenlabs";
import type { Memory } from "../../apps/coach/src/coach/contract";
import type { Agent, Learner } from "../../apps/coach/src/db/repo";
import { AGENT_NUMBER, LEARNER_PHONE, seedAgent, seedLearner, startCoach, waitFor, type Coach } from "./helpers";

const SECRET = "dial_sh_test_secret";

interface FakeConversation extends AgentConnection {
  callId: string;
  elAgentId: string;
  sent: Record<string, any>[];
  closed: boolean;
  emit(ev: ElevenLabsEvent): void;
  hangUp(): void;
}

function fakeElevenLabs() {
  const conversations: FakeConversation[] = [];
  const connect = (callId: string, elAgentId: string): AgentConnection => {
    const handlers: ((ev: ElevenLabsEvent) => void)[] = [];
    let onClose: (reason: string) => void = () => {};
    const c: FakeConversation = {
      callId,
      elAgentId,
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

let coach: Coach;
let bridge: VoiceBridge;
let el: ReturnType<typeof fakeElevenLabs>;
let agent: Agent;
let learner: Learner;
let remembered: string[];
const sockets: WebSocket[] = [];

beforeEach(async () => {
  el = fakeElevenLabs();
  coach = await startCoach({}, { dialSelfHostedSecret: SECRET });
  remembered = [];
  const memory: Memory = coach.deps.memory;
  const remember = memory.remember;
  memory.remember = async (learnerId, eventId) => (remembered.push(eventId), remember(learnerId, eventId));
  bridge = attachVoiceBridge(coach.server, coach.deps, { connectAgent: el.connect, reconnectGraceMs: 50, goodbyeTimeoutMs: 500 });
  agent = await seedAgent(coach.deps);
  learner = await seedLearner(coach.deps, agent);
  await coach.deps.memory.rememberFact(learner.id, { rel: "trip_to", object: "lyon" });
});

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  bridge.close();
  await coach.close();
});

function sign(callId: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${callId}`).digest("hex")}`;
}

async function dialConnect(callId: string, signature: string | null = sign(callId)) {
  const ws = new WebSocket(`${coach.url.replace("http", "ws")}/dial/voice/${callId}`, { headers: signature ? { "x-dial-signature": signature } : {} });
  sockets.push(ws);
  const received: Record<string, any>[] = [];
  ws.on("message", (d) => received.push(JSON.parse(d.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, received, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

const connected = (callId: string, direction: "inbound" | "outbound", from: string, to: string) => ({
  type: "call_connected",
  call_id: callId,
  direction,
  from,
  to,
  formats: { inbound: "mulaw_8000", outbound: "mulaw_8000" },
  reconnect: false,
});

const metadata: ElevenLabsEvent = {
  type: "conversation_initiation_metadata",
  conversation_initiation_metadata_event: { conversation_id: "conv_1", user_input_audio_format: "ulaw_8000", agent_output_audio_format: "ulaw_8000" },
};

async function startCall(callId: string, direction: "inbound" | "outbound" = "inbound") {
  const dial = await dialConnect(callId);
  dial.send(direction === "inbound" ? connected(callId, "inbound", LEARNER_PHONE, AGENT_NUMBER) : connected(callId, "outbound", AGENT_NUMBER, LEARNER_PHONE));
  const conv = await waitFor(() => el.conversations.find((c) => c.callId === callId));
  return { dial, conv };
}

describe("coach voice bridge", () => {
  it("rejects connections without a valid Dial signature", async () => {
    await expect(dialConnect("call_1", null)).rejects.toThrow(/401/);
    await expect(dialConnect("call_1", sign("call_1", "wrong"))).rejects.toThrow(/401/);
    expect(el.conversations).toHaveLength(0);
  });

  it("an inbound call to the agent's number opens that agent's ElevenLabs agent, in its language and voice, with the learner's memory", async () => {
    const { conv } = await startCall("call_in");
    expect(conv.elAgentId).toBe("el_agent_camille");
    const init = conv.sent[0];
    expect(init.type).toBe("conversation_initiation_client_data");
    const o = init.conversation_config_override;
    expect(o.agent.language).toBe("fr");
    expect(o.tts.voice_id).toBe("voice_fr_camille");
    expect(o.agent.prompt.prompt).toMatch(/Travelling to lyon/);
    expect(o.agent.prompt.prompt).toMatch(/A2/);
    expect(typeof o.agent.first_message).toBe("string");
    expect(init.dynamic_variables ?? {}).toBeTypeOf("object");
  });

  it("an outbound call from the agent's number finds the same agent and learner", async () => {
    const { conv } = await startCall("call_out", "outbound");
    expect(conv.elAgentId).toBe("el_agent_camille");
    expect(conv.sent[0].conversation_config_override.agent.prompt.prompt).toMatch(/Travelling to lyon/);
  });

  it("a call from an unknown phone to the agent registers the learner", async () => {
    const dial = await dialConnect("call_new");
    dial.send(connected("call_new", "inbound", "+15551112222", AGENT_NUMBER));
    await waitFor(() => el.conversations.find((c) => c.callId === "call_new"));
    expect(await coach.deps.repo.learnerByPhone(agent.id, "+15551112222")).not.toBeNull();
  });

  it("a call on a number no agent owns is ended without opening ElevenLabs", async () => {
    const dial = await dialConnect("call_x");
    dial.send(connected("call_x", "inbound", LEARNER_PHONE, "+15550000000"));
    await waitFor(() => dial.received.find((m) => m.type === "end_call"));
    expect(el.conversations).toHaveLength(0);
  });

  it("relays μ-law audio both ways once ElevenLabs reports its formats", async () => {
    const { dial, conv } = await startCall("call_audio");
    conv.emit(metadata);
    const caller = Buffer.alloc(160, 0x7e).toString("base64");
    dial.send({ type: "media", payload: caller });
    await waitFor(() => conv.sent.find((m) => "user_audio_chunk" in m));
    const voice = Buffer.alloc(320, 0x55).toString("base64");
    conv.emit({ type: "audio", audio_event: { audio_base_64: voice, event_id: 1 } });
    await waitFor(() => dial.received.find((m) => m.type === "media" && m.payload === voice));
  });

  it("client tools read and write the caller's memory", async () => {
    const { conv } = await startCall("call_tools");
    conv.emit(metadata);
    conv.emit({ type: "client_tool_call", client_tool_call: { tool_name: "remember_fact", tool_call_id: "t1", parameters: { rel: "likes", object: "jazz" }, expects_response: true } });
    await waitFor(() => conv.sent.find((m) => m.type === "client_tool_result" && m.tool_call_id === "t1"));
    expect((await coach.deps.memory.profile(learner.id)).facts.map((f) => f.rel)).toContain("likes");
    conv.emit({ type: "client_tool_call", client_tool_call: { tool_name: "get_learner_profile", tool_call_id: "t2", parameters: {}, expects_response: true } });
    const res = await waitFor(() => conv.sent.find((m) => m.type === "client_tool_result" && m.tool_call_id === "t2"));
    expect(String(res.result)).toMatch(/lyon/i);
    expect(res.is_error).toBe(false);
  });

  it("stores the call transcript as a call event and hands it to memory at call end", async () => {
    const { dial, conv } = await startCall("call_end");
    conv.emit(metadata);
    conv.emit({ type: "agent_response", agent_response_event: { agent_response: "Salut Sam ! Prêt pour Lyon ?" } });
    conv.emit({ type: "user_transcript", user_transcription_event: { user_transcript: "Oui, j'adore le jazz" } });
    dial.send({ type: "call_ended", reason: "hangup" });
    const ev = await waitFor(async () => (await coach.deps.repo.recentEvents(learner.id)).find((e) => e.channel === "call"));
    expect(ev.text).toMatch(/Salut Sam/);
    expect(ev.text).toMatch(/j'adore le jazz/);
    expect(ev.dial_id).toBe("call_end");
    await waitFor(() => remembered.includes(ev.id));
    expect(conv.closed).toBe(true);
  });
});
