import { LANGUAGES, elLanguage } from "@backpack/shared/coach";
import type { Recall } from "../coach/contract";
import type { Agent, Learner } from "../db/repo";

export interface CallSetup {
  prompt: string;
  firstMessage: string;
}

export const languageName = (code: string) =>
  LANGUAGES.find((l) => l.code === code || l.el === elLanguage(code))?.name ?? code;

const GREETINGS: Record<string, (agent: string, learner: string | null) => string> = {
  fr: (a, l) => `Allô${l ? ` ${l}` : ""} ! C'est ${a}. Comment ça va ?`,
  es: (a, l) => `¡Hola${l ? ` ${l}` : ""}! Soy ${a}. ¿Qué tal?`,
  de: (a, l) => `Hallo${l ? ` ${l}` : ""}! Hier ist ${a}. Wie geht's?`,
  it: (a, l) => `Ciao${l ? ` ${l}` : ""}! Sono ${a}. Come stai?`,
  pt: (a, l) => `Olá${l ? ` ${l}` : ""}! Aqui é ${a}. Tudo bem?`,
  ja: (a, l) => `もしもし${l ? `、${l}さん` : ""}！${a}です。お元気ですか？`,
};

/** A short greeting in the agent's language, using the learner's name when known. */
export function firstMessage(agent: Agent, learner: Learner | null): string {
  const greet = GREETINGS[elLanguage(agent.language)] ?? ((a: string, l: string | null) => `Hello${l ? ` ${l}` : ""}! It's ${a}.`);
  return greet(agent.name, learner?.display_name?.trim() || null);
}

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (nothing yet)");

/** The ElevenLabs prompt override for one call: persona, the learner's level and memory, and the call rules. */
export function buildCallPrompt(agent: Agent, learner: Learner | null, recall: Recall): CallSetup {
  const language = languageName(agent.language);
  const level = learner?.level ?? null;
  const opening = firstMessage(agent, learner);
  const pace =
    level === "A1" || level === "A2"
      ? "Speak slowly and clearly, with short simple sentences and everyday words. Repeat or rephrase when they get lost."
      : level
        ? "Speak at a natural but clear pace, with vocabulary a little above their level."
        : "Their level is unknown: start very simple and adjust to how they answer.";

  const prompt = `You are ${agent.name}, a friendly local from ${agent.persona_city}, on a phone call with a learner of ${language}${
    learner?.display_name ? ` called ${learner.display_name}` : ""
  }. You are their language coach and a warm, curious conversation partner.

Learner level (CEFR): ${level ?? "unknown"}.

What you know about them:
${list(recall.facts)}

Things they told you before:
${list(recall.memories)}

What they struggle with (work on these):
${list(recall.struggles)}

Rules:
- Speak mostly ${language}, pitched at the learner's level. Use a little English only to unblock them.
- ${pace}
- Practise situations that matter for their trip, their interests and the things they are anxious about. Role-play them (ordering food, asking the way, small talk with a local).
- Correct mistakes gently: repeat what they meant correctly, then carry on. Never lecture.
- Keep your turns short (one or two sentences) and end most turns with a question, so they do most of the talking.
- When they share something worth remembering (a plan, a like, a worry, a struggle), call remember_fact. Call get_learner_profile if you need a reminder of who they are.
- The call already opened with your first line: "${opening}". Do not say it again; wait for their reply.
- When they want to stop, say a short goodbye in ${language} and end the call.`;
  return { prompt, firstMessage: opening };
}
