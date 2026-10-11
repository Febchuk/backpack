// COACH_DEMO=1: Tolu's scripted demo — fixed texts per beat, the itinerary card, the call, the post-call follow-up.
import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { WebSocket } from "ws";
import { attachVoiceBridge, type VoiceBridge } from "../../apps/coach/src/voice/bridge";
import type { AgentConnection, ElevenLabsEvent } from "../../apps/coach/src/voice/elevenlabs";
import { DEMO_CALL, FOLLOW_UP } from "../../apps/coach/src/demo/script";
import { AGENT_NUMBER, LEARNER_PHONE, deliver, messageReceived, seedAgent, startCoach, waitFor, type Coach } from "./helpers";

const SECRET = "dial_sh_demo_secret";
const ASSETS = {
  brunchVenue: "Café Test",
  tiktokUrl: "https://www.tiktok.com/@test/video/1",
  reviewsUrl: "https://maps.app.goo.gl/test",
  bikeRouteUrl: "",
};

let coach: Coach;
let bridge: VoiceBridge | undefined;
afterEach(async () => {
  bridge?.close();
  bridge = undefined;
  await coach.close();
});

const boot = (extra = {}) => startCoach({}, { demo: true, demoDelayScale: 0.02, demoAssets: ASSETS, ...extra });
const sent = () => coach.dial.messages.filter((m) => m.to === LEARNER_PHONE);
const bodies = () => sent().map((m) => m.body ?? "");
const text = (body: string) => deliver(coach, messageReceived({ body }));

async function startDemo(agentId: string) {
  const res = await coach.post("/api/demo/start", { agent_id: agentId, phone: LEARNER_PHONE });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as { id: string };
}

describe("scripted demo", () => {
  it("plays the script beat by beat, rings the presenter, then follows up once", async () => {
    coach = await boot();
    const agent = await seedAgent(coach.deps, { name: "Tolu" });
    const learner = await startDemo(agent.id);

    await waitFor(() => sent().length === 2);
    expect(bodies()[0]).toMatch(/^Yoooo! I’m Tolu, your local AI fixer 🤝 Miku told me/);
    expect(bodies()[1]).toMatch(/when do you land/);

    // A double-text gets one reply.
    await Promise.all([text("Friday night"), text("five days. Intimate music spots, unusual bars. Mushrooms, pastries, cheese. No meat.")]);
    await waitFor(() => sent().length === 3);
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies()).toHaveLength(3);
    expect(bodies()[2]).toBe("Okayyy, got you. And how’s your French? Anything that makes you nervous?");

    await text("I can order basic things, but I get lost when people say too much at once.");
    await waitFor(() => sent().length === 10);
    const itinerary = bodies().slice(3);
    expect(itinerary[1]).toMatch(/slow Saturday morning/);
    expect(itinerary[2]).toContain("11:30 — Brunch at Café Test");
    expect(itinerary[2]).toContain("🎥 https://www.tiktok.com/@test/video/1");
    expect(itinerary[2]).toContain("⭐ https://maps.app.goo.gl/test");
    expect(itinerary[3]).toContain("Illustrative access—requires venue confirmation");
    expect(itinerary[4]).not.toContain("🚲"); // no route link configured
    expect(itinerary[5]).toContain("Moonshiner");
    expect(itinerary[6]).toBe("How’s that looking? Anything you’d swap?");

    const memory = await (await coach.get(`/api/learners/${learner.id}/memory`)).json();
    const card = memory.events.find((e: any) => e.feedback?.card)?.feedback.card;
    expect(card.stops.map((s: any) => s.time)).toEqual(["11:30", "2–5", "5:30", "Evening"]);
    expect(card.stops[0].badge).toBe("Demo example");
    expect(card.stops[1].badge).toMatch(/requires venue confirmation/);

    await text("Love it. Let’s do that.");
    await waitFor(() => sent().length === 12);
    expect(bodies()[11]).toMatch(/pretend I’m the server/);

    await text("Yep, call me.");
    await waitFor(() => coach.dial.calls.length === 1);
    expect(bodies()[12]).toBe("Calling you now 📞");
    expect(coach.dial.calls[0]).toMatchObject({ to: LEARNER_PHONE, from: "num_camille" });

    const callEnded = (id: string) => ({
      id,
      type: "call.ended",
      data: { callId: "mock_call_1", from: AGENT_NUMBER, to: LEARNER_PHONE, direction: "outbound", status: "completed" },
    });
    await deliver(coach, callEnded("evt_end_1"));
    await deliver(coach, callEnded("evt_end_2"));
    const voice = await waitFor(() => sent().find((m) => m.mediaUrls?.length));
    expect(bodies()).toContain(FOLLOW_UP.texts[0]);
    expect(bodies()).toContain(FOLLOW_UP.texts[1]);
    expect(Buffer.from(await (await fetch(voice.mediaUrls![0])).arrayBuffer()).toString()).toContain("Le mot de passe");
    await new Promise((r) => setTimeout(r, 50));
    expect(sent().filter((m) => m.mediaUrls?.length)).toHaveLength(1);

    await text("Je voudrais le plat hors carte, s’il vous plaît.");
    await waitFor(() => bodies().at(-1)?.startsWith("Perfect 👌"));
    await text("merci!");
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies().at(-1)).toMatch(/^Perfect 👌/); // the script has ended: no more replies
  });

  it("a first text to the number starts the script, and /api/demo/start resets it", async () => {
    coach = await boot();
    const agent = await seedAgent(coach.deps);
    await text("hi");
    await waitFor(() => sent().length === 2);
    await text("Friday night, five days");
    await waitFor(() => sent().length === 3);

    await startDemo(agent.id);
    await waitFor(() => sent().length === 5);
    expect(bodies()[3]).toMatch(/^Yoooo!/);
    await text("Friday night, five days");
    await waitFor(() => sent().length === 6);
    expect(bodies()[5]).toMatch(/^Okayyy, got you/);
  });

  it("is off by default", async () => {
    coach = await startCoach();
    expect(await (await coach.get("/api/demo")).json()).toEqual({ enabled: false });
    expect((await coach.post("/api/demo/start", {})).status).toBe(404);
  });

  it("the call uses the locked waiter script, and hanging up sends the follow-up", async () => {
    coach = await boot({ dialSelfHostedSecret: SECRET });
    const conversations: (AgentConnection & { callId: string; sent: any[]; emit(ev: ElevenLabsEvent): void })[] = [];
    bridge = attachVoiceBridge(coach.server, coach.deps, {
      connectAgent: (callId) => {
        const handlers: ((ev: ElevenLabsEvent) => void)[] = [];
        const c = {
          callId,
          sent: [] as any[],
          send: (m: any) => void c.sent.push(m),
          onMessage: (cb: (ev: ElevenLabsEvent) => void) => void handlers.push(cb),
          onClose: () => {},
          close: () => {},
          emit: (ev: ElevenLabsEvent) => handlers.forEach((h) => h(ev)),
        };
        conversations.push(c);
        return c;
      },
      reconnectGraceMs: 50,
      goodbyeTimeoutMs: 500,
    });
    const agent = await seedAgent(coach.deps);
    await coach.deps.repo.upsertLearner(agent.id, LEARNER_PHONE);

    const callId = "call_demo";
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${crypto.createHmac("sha256", SECRET).update(`${t}.${callId}`).digest("hex")}`;
    const ws = new WebSocket(`${coach.url.replace("http", "ws")}/dial/voice/${callId}`, { headers: { "x-dial-signature": signature } });
    await new Promise((r) => ws.once("open", r));
    ws.send(
      JSON.stringify({
        type: "call_connected",
        call_id: callId,
        direction: "outbound",
        from: AGENT_NUMBER,
        to: LEARNER_PHONE,
        formats: { inbound: "mulaw_8000", outbound: "mulaw_8000" },
        reconnect: false,
      }),
    );
    const conv = await waitFor(() => conversations[0]);
    const agentOverride = conv.sent[0].conversation_config_override.agent;
    expect(agentOverride.first_message).toBe(DEMO_CALL.firstMessage);
    expect(agentOverride.prompt.prompt).toContain("le jardin");

    conv.emit({ type: "agent_response", agent_response_event: { agent_response: DEMO_CALL.firstMessage } });
    conv.emit({ type: "user_transcript", user_transcription_event: { user_transcript: "Je voudrais le plat hors carte" } });
    ws.send(JSON.stringify({ type: "call_ended", reason: "hangup" }));
    await waitFor(() => sent().find((m) => m.mediaUrls?.length));
    expect(bodies()).toContain(FOLLOW_UP.texts[0]);
    ws.terminate();
  });
});
