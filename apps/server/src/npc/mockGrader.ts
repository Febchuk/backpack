import { normalizePhrase, type NpcId, type NpcTurnResponse } from "@backpack/shared";
import type { NpcTurnInput } from "../adapters/types";

type Line = { fr: string; en: string };

/** Canned replies: `done` when the mission is complete (or open play went well), `more` otherwise. */
const LINES: Record<NpcId, { done: Line; more: Line }> = {
  clerk: {
    done: { fr: "Voilà votre carte SIM ! Quel est votre numéro ?", en: "Here's your SIM card! What's your number?" },
    more: { fr: "Pardon ? Qu'est-ce que vous voulez ?", en: "Sorry? What would you like?" },
  },
  barista: {
    done: { fr: "Bien sûr ! Un café, tout de suite.", en: "Of course! One coffee, right away." },
    more: { fr: "Oui ? Je vous écoute.", en: "Yes? I'm listening." },
  },
  girard: {
    done: { fr: "Bonjour ! Quel beau quartier, n'est-ce pas ?", en: "Hello! What a lovely neighborhood, isn't it?" },
    more: { fr: "Prenez votre temps, mon ami.", en: "Take your time, my friend." },
  },
  margaux: {
    done: { fr: "Bonjour ! Qu'est-ce qu'il vous faut ?", en: "Hello! What do you need?" },
    more: { fr: "On dit bonjour, d'abord.", en: "First, we say hello." },
  },
  ines: {
    done: { fr: "Bienvenue à l'auberge ! Ça va ?", en: "Welcome to the hostel! How are you?" },
    more: { fr: "Pas de souci, je vous écoute.", en: "No worries, I'm listening." },
  },
  theo: {
    done: { fr: "Salut ! Ça roule ?", en: "Hey! How's it going?" },
    more: { fr: "Hein ? Vas-y, répète !", en: "Huh? Go on, say it again!" },
  },
};

/** Phrases logged for open-play NPCs (no mission). */
export const OPEN_PLAY_PHRASES: Record<NpcId, string[]> = {
  clerk: ["bonjour", "merci"],
  barista: ["bonjour", "merci"],
  girard: ["bonjour", "ça va", "merci"],
  margaux: ["bonjour", "s'il vous plaît", "merci"],
  ines: ["bonjour", "merci", "où est"],
  theo: ["salut", "ça va", "merci"],
};

/** Deterministic grader for MOCK_GEMINI: case/accent-insensitive substring match per CONTRACT.md. */
export function mockGrade(input: Omit<NpcTurnInput, "npcId"> & { npcId?: string }): NpcTurnResponse {
  const npc = input.npcId as NpcId | undefined;
  const text = input.text ?? "";
  const heardNorm = normalizePhrase(text);
  const used: string[] = [];
  const missed: string[] = [];
  for (const phrase of input.targetPhrases) {
    (heardNorm.includes(normalizePhrase(phrase)) ? used : missed).push(phrase);
  }
  const missingRequired = input.requiredPhrases.filter((p) => !used.includes(p));
  const complete = input.missionGoal ? missingRequired.length === 0 : null;
  const good = complete ?? used.length > 0;
  const lines = npc && npc in LINES ? LINES[npc] : { done: { fr: "D'accord !", en: "Okay!" }, more: { fr: "Pardon ?", en: "Sorry?" } };
  const line = good ? lines.done : lines.more;
  const saidBonjour = heardNorm.includes("bonjour");
  return {
    reply_fr: line.fr,
    reply_en_hint: line.en,
    heard: text,
    phrases_used: used,
    phrases_missed: missed,
    hint: missingRequired.length ? `Try: ${missingRequired[0]}` : good ? "Très bien! Keep going." : "Try: bonjour",
    mission_complete: complete,
    mood: npc === "margaux" && !saidBonjour ? "cold" : "patient",
  };
}
