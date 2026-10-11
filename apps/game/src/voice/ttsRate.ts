/**
 * Adaptive NPCs (CONTRACT.md, Level 4): NPC replies are spoken more slowly for level-1 players.
 * `speechSynthesis` rate for an NPC reply, given `PlayerState.player.level` (1 = total beginner).
 * Wire it where the game speaks: `utterance.rate = ttsRateForLevel(state.player.level)`.
 */
export const TTS_RATE_BEGINNER = 0.8;
export const TTS_RATE_DEFAULT = 0.95;

export function ttsRateForLevel(level: number | null | undefined): number {
  return (level ?? 1) <= 1 ? TTS_RATE_BEGINNER : TTS_RATE_DEFAULT;
}

/** Splits a leading `*stage direction*` off an English hint, so the dialogue box can show it in italics. */
export function splitStageDirection(hint: string): { direction: string | null; text: string } {
  const m = /^\s*\*([^*]+)\*\s*/.exec(hint);
  return m ? { direction: m[1].trim(), text: hint.slice(m[0].length) } : { direction: null, text: hint };
}
