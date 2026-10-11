import { normalizePhrase, type NpcTurnResponse } from "@backpack/shared";
import type { NpcTurnInput } from "../adapters/types";

type GradingInput = Pick<NpcTurnInput, "missionGoal" | "targetPhrases" | "requiredPhrases" | "text" | "history">;

/**
 * Matching key for a phrase or an utterance: normalizePhrase, plus curly apostrophes (Gemini transcripts and phone
 * keyboards write "s’il vous plaît") and elisions folded to spaces, so "s’il", "s'il" and "s il" all match.
 */
export function phraseKey(s: string): string {
  return normalizePhrase(s.replace(/[’‘ʼ`´]/g, "'"))
    .replace(/'/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if `phrase` appears in `said` as whole words (case-, accent-, punctuation- and apostrophe-insensitive). */
export function saysPhrase(said: string, phrase: string): boolean {
  const p = phraseKey(phrase);
  return p.length > 0 && ` ${phraseKey(said)} `.includes(` ${p} `);
}

/**
 * Deterministic post-processing of a model turn. A target phrase counts as used if the model judged it used
 * OR the mock grader would count it (it appears in what was heard or typed), so accented beginner speech still counts.
 * Non-target phrases the model invents are dropped. mission_complete = every required phrase used, this turn or in a
 * remembered earlier turn with the same NPC (the model sees that memory too, so "bonjour" said one turn earlier
 * still counts and the reply and the grade agree); null in open play. Only this turn's phrases are logged as used.
 * Reply and mood are kept as the model gave them. When a required phrase is still missing and the model's hint
 * does not name one, the hint names the first missing one, so the player always knows what to say next.
 */
export function reconcileGrading(input: GradingInput, turn: NpcTurnResponse): NpcTurnResponse {
  const said = `${turn.heard} ${input.text ?? ""}`;
  const judged = new Set(turn.phrases_used.map(phraseKey));
  const isUsed = (p: string) => judged.has(phraseKey(p)) || saysPhrase(said, p);
  const used = input.targetPhrases.filter(isUsed);
  const missed = input.targetPhrases.filter((p) => !isUsed(p));
  const earlier = (input.history ?? []).map((h) => h.heard).join(" / ");
  const missingRequired = input.missionGoal ? input.requiredPhrases.filter((p) => !isUsed(p) && !saysPhrase(earlier, p)) : [];
  const hintNamesMissing = missingRequired.some((p) => saysPhrase(turn.hint, p));
  return {
    ...turn,
    phrases_used: used,
    phrases_missed: missed,
    hint: missingRequired.length && !hintNamesMissing ? `Try: ${missingRequired[0]}` : turn.hint,
    mission_complete: input.missionGoal ? missingRequired.length === 0 : null,
  };
}
