import { type NpcId, type NpcTurnResponse } from "@backpack/shared";
import type { NpcTurnInput } from "../adapters/types";
import { saysPhrase } from "./grading";

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

/**
 * Target phrases for open-play NPCs (no mission). Each turn logs them as used or missed, so they feed Luna's
 * debrief; keep each list short and on the NPC's topic.
 */
export const OPEN_PLAY_PHRASES: Record<NpcId, string[]> = {
  clerk: ["bonjour", "merci"],
  barista: ["bonjour", "merci"],
  // Beginner small talk on the bench.
  girard: ["bonjour", "ça va ?", "je m'appelle", "il fait beau", "au revoir"],
  // Boulangerie etiquette, ordering and haggling.
  margaux: ["bonjour", "une baguette", "un croissant", "c'est combien ?", "c'est trop cher"],
  // Hostel desk: directions and what to do next.
  ines: ["bonjour", "où est", "c'est loin ?", "à gauche", "à droite"],
  // Casual French, slang and verlan.
  theo: ["salut", "ça roule ?", "c'est ouf", "trop bien", "à plus"],
};

/** Level-1 gestures: the dialogue box shows a leading `*...*` in italics (CONTRACT.md, Level 4 adaptive NPCs). */
export const GESTURES: Record<NpcId, string> = {
  clerk: "*points at the SIM cards*",
  barista: "*points at the menu*",
  girard: "*pats his dog and smiles*",
  margaux: "*taps the counter*",
  ines: "*points down the street*",
  theo: "*strums a chord*",
};

/** At level 1, prefix a stage direction to the English hint (unless it already has one). */
export function withGesture(hint: string, npcId: string | undefined, level: number): string {
  const gesture = npcId && npcId in GESTURES ? GESTURES[npcId as NpcId] : null;
  if (level > 1 || !gesture || hint.trimStart().startsWith("*")) return hint;
  return `${gesture} ${hint}`;
}

/** Deterministic grader for MOCK_GEMINI: case/accent-insensitive whole-word match per CONTRACT.md. */
export function mockGrade(input: Omit<NpcTurnInput, "npcId"> & { npcId?: string }): NpcTurnResponse {
  const npc = input.npcId as NpcId | undefined;
  const text = input.text ?? "";
  const used: string[] = [];
  const missed: string[] = [];
  for (const phrase of input.targetPhrases) (saysPhrase(text, phrase) ? used : missed).push(phrase);
  const missingRequired = input.requiredPhrases.filter((p) => !used.includes(p));
  const complete = input.missionGoal ? missingRequired.length === 0 : null;
  // Margaux will not serve anyone who skipped "bonjour".
  const snubbed = npc === "margaux" && !saysPhrase(text, "bonjour");
  const good = !snubbed && (complete ?? used.length > 0);
  const lines = npc && npc in LINES ? LINES[npc] : { done: { fr: "D'accord !", en: "Okay!" }, more: { fr: "Pardon ?", en: "Sorry?" } };
  const line = good ? lines.done : lines.more;
  const opener = input.targetPhrases[0] ?? "bonjour";
  return {
    reply_fr: line.fr,
    reply_en_hint: withGesture(line.en, npc, input.level),
    heard: text,
    phrases_used: used,
    phrases_missed: missed,
    hint: missingRequired.length
      ? `Try: ${missingRequired[0]}`
      : snubbed
        ? "Say bonjour first!"
        : good
          ? "Très bien! Keep going."
          : `Try: ${opener}`,
    mission_complete: complete,
    mood: snubbed ? "cold" : "patient",
  };
}
