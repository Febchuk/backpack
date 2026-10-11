import { normalizePhrase, type NpcTurnResponse } from "@backpack/shared";
import type { NpcTurnInput } from "../adapters/types";

type GradingInput = Pick<NpcTurnInput, "missionGoal" | "targetPhrases" | "requiredPhrases" | "text">;

/**
 * Deterministic post-processing of a model turn. A target phrase counts as used if the model judged it used
 * OR its normalized form appears in what was heard (or typed), so accented beginner speech still counts.
 * Non-target phrases the model invents are dropped. mission_complete = every required phrase used (null in open play).
 * Reply, hint and mood are kept as the model gave them.
 */
export function reconcileGrading(input: GradingInput, turn: NpcTurnResponse): NpcTurnResponse {
  const said = normalizePhrase(`${turn.heard} ${input.text ?? ""}`);
  const judged = new Set(turn.phrases_used.map(normalizePhrase));
  const isUsed = (p: string) => judged.has(normalizePhrase(p)) || said.includes(normalizePhrase(p));
  const used = input.targetPhrases.filter(isUsed);
  const missed = input.targetPhrases.filter((p) => !isUsed(p));
  return {
    ...turn,
    phrases_used: used,
    phrases_missed: missed,
    mission_complete: input.missionGoal ? input.requiredPhrases.every(isUsed) : null,
  };
}
