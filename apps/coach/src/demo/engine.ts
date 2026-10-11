import type { Deps } from "../app";
import type { Agent, Learner } from "../db/repo";
import type { Engine } from "../coach/contract";
import { line, placeCoachCall } from "../coach/engine";
import { FOLLOW_UP, demoBeats, itineraryCard, type Beat } from "./script";

type EngineDeps = Omit<Deps, "engine">;

/** Wait after a text before answering, so a double-text ("Friday night" … "five days") gets one reply. */
const SETTLE_MS = 2500;
const HISTORY = 200;

/**
 * COACH_DEMO=1: Tolu answers from a fixed script instead of Gemini. Each burst of presenter texts moves one beat on;
 * the beat a message opens is stored on it (`feedback.beat`), so state survives restarts and resets with the events.
 */
export function createDemoEngine(deps: EngineDeps): Engine {
  const { config, repo, dial, voiceNotes } = deps;
  const beats = demoBeats(config.demoAssets);
  const card = itineraryCard(config.demoAssets);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms * config.demoDelayScale));
  const log = (what: string, e: unknown) => console.error(`[coach:demo] ${what}:`, e instanceof Error ? e.message : e);
  const followedUp = new Set<string>();

  // One beat at a time per learner, in arrival order.
  const queues = new Map<string, Promise<unknown>>();
  function serial(learnerId: string, fn: () => Promise<void>) {
    const next = (queues.get(learnerId) ?? Promise.resolve()).then(fn).catch((e) => log(`learner ${learnerId}`, e));
    queues.set(learnerId, next);
    return next;
  }

  async function sendText(agent: Agent, learner: Learner, text: string, feedback: { beat?: number; card?: typeof card } | null) {
    await repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "out", text, feedback });
    await dial.sendMessage({ from: line(agent), to: learner.phone, body: text });
  }

  async function sendVoice(agent: Agent, learner: Learner, text: string) {
    const { url } = await voiceNotes.speak({ text, agent, learner });
    await repo.addEvent({ learner_id: learner.id, channel: "voice_note", direction: "out", text, media_url: url });
    await dial.sendMessage({ from: line(agent), to: learner.phone, mediaUrls: [url] });
  }

  async function play(agent: Agent, learner: Learner, index: number, beat: Beat) {
    for (const [i, m] of beat.messages.entries()) {
      await sleep(m.delayMs);
      await sendText(agent, learner, m.text, { ...(i === 0 ? { beat: index } : {}), ...(m.card ? { card } : {}) });
    }
    if (beat.then === "call") {
      await sleep(2000);
      const { call_id } = await placeCoachCall(dial, agent, learner);
      console.log(`[coach:demo] ringing ${learner.id} (${call_id})`);
    }
  }

  async function lastBeat(learnerId: string) {
    const events = await repo.recentEvents(learnerId, HISTORY);
    return Math.max(-1, ...events.map((e) => e.feedback?.beat ?? -1));
  }

  async function start(agent: Agent, learner: Learner) {
    await serial(learner.id, async () => {
      if ((await lastBeat(learner.id)) >= 0) return;
      await play(agent, learner, 0, beats[0]);
    });
  }

  return {
    async handleInbound(agent, learner, msg) {
      if (await repo.hasDialId(msg.messageId)) return;
      const inbound = await repo.addEvent({
        learner_id: learner.id,
        channel: "sms",
        direction: "in",
        text: msg.body,
        media_url: msg.media[0]?.url ?? null,
        dial_id: msg.messageId,
      });
      if (!inbound) return;
      await sleep(SETTLE_MS);
      await serial(learner.id, async () => {
        const events = await repo.recentEvents(learner.id, HISTORY);
        const latest = events.filter((e) => e.direction === "in").at(-1);
        if (latest?.id !== inbound.id) return; // a newer text answers the burst
        const next = Math.max(-1, ...events.map((e) => e.feedback?.beat ?? -1)) + 1;
        if (next === 0 || next >= beats.length) return;
        await play(agent, learner, next, beats[next]);
      });
    },

    startOnboarding: start,

    async afterCall(agent, learner, callId) {
      if (followedUp.has(callId)) return;
      followedUp.add(callId);
      await serial(learner.id, async () => {
        await sleep(FOLLOW_UP.delayMs);
        for (const text of FOLLOW_UP.texts) {
          await sendText(agent, learner, text, null);
          await sleep(2000);
        }
        await sendVoice(agent, learner, FOLLOW_UP.voice).catch((e) => log("voice note failed", e));
      });
    },
  };
}
