import { Router } from "express";
import multer from "multer";
import { MISSIONS, MISSION_FOR_NPC, MissionKey, NpcId } from "@backpack/shared";
import type { Deps } from "../app";
import { PERSONAS } from "../npc/personas";
import { OPEN_PLAY_PHRASES } from "../npc/mockGrader";

/**
 * NPC turn. An NPC with a mission (or an explicit mission_key) always grades against that mission;
 * a complete turn marks it done and activates the next one. Other NPCs are open play (mission_complete null).
 */
export function npcRouter(deps: Deps) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } });
  r.post("/npc/:npcId/turn", upload.single("audio"), async (req, res, next) => {
    try {
      const npc = NpcId.safeParse(req.params.npcId);
      if (!npc.success) return res.status(404).json({ error: "unknown npc" });
      const playerId = req.body?.player_id;
      if (typeof playerId !== "string" || !deps.repo.playerExists(playerId))
        return res.status(404).json({ error: "unknown player" });

      let missionKey: MissionKey | undefined = MISSION_FOR_NPC[npc.data];
      if (req.body?.mission_key) {
        const parsed = MissionKey.safeParse(req.body.mission_key);
        if (!parsed.success) return res.status(400).json({ error: "unknown mission_key" });
        missionKey = parsed.data;
      }
      const mission = missionKey ? MISSIONS[missionKey] : null;
      const requiredPhrases = mission?.required ?? [];
      const targetPhrases = mission ? [...mission.required, ...mission.bonus] : OPEN_PLAY_PHRASES[npc.data];
      const level = deps.repo.getState(playerId)?.player.level ?? 1;
      const text = typeof req.body?.text === "string" ? req.body.text : undefined;

      const turn = await deps.adapters.gemini.npcTurn({
        persona: PERSONAS[npc.data],
        missionGoal: mission?.goal ?? null,
        targetPhrases,
        requiredPhrases,
        level,
        text,
        audio: req.file ? { data: req.file.buffer, mimeType: req.file.mimetype } : undefined,
      });

      deps.repo.logTurn(playerId, turn.phrases_used, turn.phrases_missed);
      if (mission && turn.mission_complete === true) deps.repo.completeMission(playerId, mission.key);
      else if (mission && turn.hint) deps.repo.addHint(playerId, mission.key);
      deps.repo.addEvent(playerId, "game", { type: "npc_turn", npc: npc.data, mission_key: mission?.key ?? null, turn });
      res.json(turn);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
