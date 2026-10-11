import type { Level } from "@backpack/shared/coach";
import type { Deps } from "../app";
import type { Agent, CoachEvent, Learner } from "../db/repo";
import type { DialClient, Engine, InboundMessage, Recall, ReplyInput, ReplyOutput } from "./contract";
import { languageName } from "./persona";
import { STEP_FACTS, nextStep, onboardingQuestion, welcomeText } from "./onboarding";
import { buildSystemPrompt } from "./prompt";

type EngineDeps = Omit<Deps, "engine">;

const MIN_CONFIDENCE = 0.6;
const HISTORY = 10;
const EMPTY_RECALL: Recall = { facts: [], memories: [], struggles: [] };

const LEVEL_WORDS: [RegExp, Level][] = [
  [/upper[- ]?intermediate/i, "B2"],
  [/advanced|fluent|avancé|courant/i, "C1"],
  [/intermediate|intermédiaire|intermedio|conversational/i, "B1"],
  [/elementary|basic|a (?:little|bit)|un peu|get by/i, "A2"],
  [/beginner|débutant|principiante|\bnone\b|\bzero\b|never/i, "A1"],
];

/** A CEFR level from a stated level: "A2", "b1", "beginner"; C2 counts as C1. */
export function parseLevel(text: string): Level | null {
  const code = /\b([abc])\s*([12])\b/i.exec(text);
  if (code) return code[1].toUpperCase() === "C" ? "C1" : (`${code[1].toUpperCase()}${code[2]}` as Level);
  return LEVEL_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
}

/** The Dial number id an agent sends from. */
export function line(agent: Agent): string {
  const from = agent.dial_number_id ?? agent.dial_number;
  if (!from) throw new Error(`agent ${agent.id} has no Dial number`);
  return from;
}

/** Rings the learner from the agent's line; the voice bridge takes the call from there. */
export function placeCoachCall(dial: DialClient, agent: Agent, learner: Learner) {
  return dial.placeCall({
    from: line(agent),
    to: learner.phone,
    language: agent.language,
    instruction: `You are ${agent.name}, a friendly local from ${agent.persona_city}. Have a short, relaxed practice conversation in ${languageName(agent.language)} at the learner's level.`,
  });
}

const isAudio = (m: { contentType: string }) => m.contentType.toLowerCase().startsWith("audio/");

function historyOf(events: CoachEvent[], excludeId: string): ReplyInput["history"] {
  return events
    .filter((e) => e.id !== excludeId && e.text)
    .slice(-HISTORY)
    .map((e) => ({ role: e.direction === "in" ? "learner" : "agent", text: e.channel === "call" ? `(phone call)\n${e.text}` : e.text }));
}

export function createEngine(deps: EngineDeps): Engine {
  const { repo, dial, llm, memory, voiceNotes } = deps;

  const log = (what: string, e: unknown) => console.error(`[coach:engine] ${what}:`, e instanceof Error ? e.message : e);

  async function transcribe(agent: Agent, learner: Learner, msg: InboundMessage) {
    const audio = msg.media.find(isAudio);
    if (!audio) return null;
    try {
      return { url: audio.url, ...(await voiceNotes.transcribe({ url: audio.url, contentType: audio.contentType, agent, learner })) };
    } catch (e) {
      log("transcribe failed", e);
      return { url: audio.url, transcript: msg.body.trim() || "(a voice note I couldn't hear)", notes: null };
    }
  }

  async function storeFacts(learner: Learner, reply: ReplyOutput, eventId: string) {
    for (const f of reply.facts.filter((f) => f.confidence >= MIN_CONFIDENCE && f.object.trim())) {
      await memory.rememberFact(learner.id, { rel: f.rel, object: f.object.trim() }, eventId);
      const level = f.rel === "level" ? parseLevel(f.object) : null;
      if (level) await repo.updateLearner(learner.id, { level });
    }
  }

  async function sendText(agent: Agent, learner: Learner, body: string, feedback: CoachEvent["feedback"] = null) {
    await repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "out", text: body, feedback });
    await dial.sendMessage({ from: line(agent), to: learner.phone, body });
  }

  async function sendVoice(agent: Agent, learner: Learner, text: string) {
    try {
      const { url } = await voiceNotes.speak({ text, agent, learner });
      await repo.addEvent({ learner_id: learner.id, channel: "voice_note", direction: "out", text, media_url: url });
      await dial.sendMessage({ from: line(agent), to: learner.phone, mediaUrls: [url] });
    } catch (e) {
      log("voice reply failed", e);
    }
  }

  return {
    async handleInbound(agent, learner, msg) {
      if (await repo.hasDialId(msg.messageId)) return;
      const voice = await transcribe(agent, learner, msg);
      const text = voice?.transcript ?? msg.body;
      const inbound = await repo.addEvent({
        learner_id: learner.id,
        channel: voice ? "voice_note" : "sms",
        direction: "in",
        text,
        media_url: voice?.url ?? null,
        dial_id: msg.messageId,
        feedback: voice ? { transcript: voice.transcript, notes: voice.notes } : null,
      });
      if (!inbound) return;

      const step = learner.onboarding_step;
      const onboarding = step === "done" ? undefined : { step, nextQuestion: onboardingQuestion(nextStep(step), agent) };
      const [recall, recent] = await Promise.all([
        memory.recall(learner.id, text).catch((e) => (log("recall failed", e), EMPTY_RECALL)),
        repo.recentEvents(learner.id, HISTORY + 1),
      ]);
      const reply = await llm.reply({
        system: buildSystemPrompt({ agent, learner, recall, onboarding }),
        history: historyOf(recent, inbound.id),
        message: text,
        ...(step === "done" ? {} : { expectFacts: STEP_FACTS[step] }),
      });

      await storeFacts(learner, reply, inbound.id);
      if (step !== "done") await repo.updateLearner(learner.id, { onboarding_step: nextStep(step) });

      const body = reply.correction ? `${reply.reply}\n\nTip: ${reply.correction}` : reply.reply;
      await sendText(agent, learner, body, { correction: reply.correction });
      if (voice || reply.voice_reply) await sendVoice(agent, learner, reply.reply);

      memory.remember(learner.id, inbound.id).catch((e) => log("remember failed", e));
    },

    async startOnboarding(agent, learner) {
      if (learner.onboarding_step !== "trip") return;
      if ((await repo.recentEvents(learner.id, HISTORY)).some((e) => e.direction === "out")) return;
      await sendText(agent, learner, welcomeText(agent, learner));
    },
  };
}
