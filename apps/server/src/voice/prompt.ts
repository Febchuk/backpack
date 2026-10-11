import type { Repo } from "../db/repo";
import { debriefInstruction, introInstruction } from "../luna/instructions";
import { LUNA_PERSONA } from "../luna/persona";

export interface PlacedCall {
  player_id: string;
  kind: "intro" | "debrief";
}

export interface LunaCallSetup {
  prompt: string;
  firstMessage: string;
}

const UNKNOWN_CALL = `${LUNA_PERSONA}

This call is not one you placed from the game, so you know nothing about the player's progress.
Greet them, chat for a moment in simple French, and tell them to open Backpack to keep playing. Keep it under 30 seconds, then end the call.`;

/** The scripted opening line: the first `Say only: "..."` / `Open with only: "..."` in the instruction. */
export function openingLine(instruction: string): string | null {
  return /(?:Say only|Open with only):\s*"([^"]+)"/.exec(instruction)?.[1] ?? null;
}

/**
 * Luna's prompt and first message for a self-hosted call, built from the same instructions the managed
 * agent gets. ElevenLabs speaks `first_message` itself, so the prompt is told the opening is done.
 */
export function lunaCallSetup(repo: Repo, placed: PlacedCall | null): LunaCallSetup {
  if (!placed) return { prompt: UNKNOWN_CALL, firstMessage: "Allô ? C'est Luna, ton guide IA !" };
  const instruction = placed.kind === "intro" ? introInstruction() : debriefInstruction(repo.missedPhrases(placed.player_id));
  const firstMessage = openingLine(instruction) ?? "Bonjour ! C'est Luna, ton guide IA.";
  const prompt = `${instruction}

Voice call notes:
- The call already opened with your first line: "${firstMessage}". Do not say it again: wait for the player's reply, then continue with the next step.
- Your tools act on the player on this call; never ask for or pass a player id.
- To hang up, say your goodbye, then use the end_call tool.`;
  return { prompt, firstMessage };
}
