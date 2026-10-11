import { District } from "@backpack/shared";
import type { Repo } from "../db/repo";

/**
 * Luna's tool bodies, shared by the MCP server (managed Dial voice) and the self-hosted voice bridge
 * (ElevenLabs client tools). Callers resolve and authorize `playerId` first.
 */
export const lunaTools = {
  getMissedPhrases(repo: Repo, playerId: string) {
    return { phrases: repo.missedPhrases(playerId) };
  },

  markPhraseMastered(repo: Repo, playerId: string, phrase: string) {
    repo.markMastered(playerId, phrase);
    return { ok: true, phrase, status: repo.phraseStatus(playerId, phrase) };
  },

  unlockDistrict(repo: Repo, playerId: string, district: District) {
    repo.unlock(playerId, district);
    return { ok: true, district };
  },
};

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: string };

/** Runs one of the voice tools by name with untrusted parameters, for the player on this call. */
export function runLunaTool(repo: Repo, playerId: string, name: string, params: Record<string, unknown>): ToolOutcome {
  switch (name) {
    case "get_missed_phrases":
      return { ok: true, data: lunaTools.getMissedPhrases(repo, playerId) };
    case "mark_phrase_mastered": {
      const phrase = typeof params.phrase === "string" ? params.phrase.trim() : "";
      if (!phrase) return { ok: false, error: "phrase is required" };
      return { ok: true, data: lunaTools.markPhraseMastered(repo, playerId, phrase) };
    }
    case "unlock_district": {
      const d = District.safeParse(params.district);
      if (!d.success) return { ok: false, error: `unknown district; valid: ${District.options.join(", ")}` };
      return { ok: true, data: lunaTools.unlockDistrict(repo, playerId, d.data) };
    }
    default:
      return { ok: false, error: `unknown tool ${name}` };
  }
}
