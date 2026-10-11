import type { NpcTurnInput } from "../adapters/types";

/** System prompt for the real Gemini adapter: persona + mission + phrases + level, with a strict JSON reply shape. */
export function buildSystemPrompt(input: Omit<NpcTurnInput, "audio" | "text">): string {
  const required = input.requiredPhrases;
  const bonus = input.targetPhrases.filter((p) => !required.includes(p));
  const list = (xs: string[]) => (xs.length ? xs.map((p) => `"${p}"`).join(", ") : "(none)");
  const mission = input.missionGoal
    ? [
        `MISSION: the player's goal is "${input.missionGoal}".`,
        `Required phrases (all must be used, by intent, to complete the mission): ${list(required)}.`,
        `Bonus phrases: ${list(bonus)}.`,
        `Set "mission_complete" to true only if every required phrase was used; otherwise false.`,
      ].join("\n")
    : [
        "OPEN PLAY: there is no mission. Chat freely and naturally in character.",
        `Phrases to listen for: ${list(input.targetPhrases)}.`,
        `Set "mission_complete" to null.`,
      ].join("\n");

  return [
    input.persona,
    `The player's French level is ${input.level} (1 = total beginner). Adapt your speed and vocabulary to it.`,
    mission,
    [
      "Grade on intent, not exact wording: a phrase counts as used if the player clearly said it or an equivalent, even with small mistakes.",
      'Every phrase listed above must appear exactly once, spelled exactly as listed, in either "phrases_used" or "phrases_missed".',
      'Put the player\'s words, as you understood them, in "heard".',
      'If a required phrase is missing, "hint" is a short English tip naming it (e.g. "Try: s\'il vous plaît"); otherwise a short encouragement.',
      'Mood is one of: "patient", "impatient", "warm", "cold", "amused".',
    ].join("\n"),
    [
      "Respond with ONLY this JSON object, no markdown, no extra text:",
      '{"reply_fr": string (1-2 short sentences in French), "reply_en_hint": string (English translation of reply_fr),',
      ' "heard": string, "phrases_used": string[], "phrases_missed": string[], "hint": string,',
      ' "mission_complete": boolean | null, "mood": "patient" | "impatient" | "warm" | "cold" | "amused"}',
    ].join("\n"),
  ].join("\n\n");
}
