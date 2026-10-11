import { Router } from "express";
import multer from "multer";
import type { Deps } from "../app";

/** L0 stub: forwards to the Gemini adapter. Voice lane: personas, mission lookup, phrase logging. */
export function npcRouter(deps: Deps) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } });
  r.post("/npc/:npcId/turn", upload.single("audio"), async (req, res, next) => {
    try {
      const turn = await deps.adapters.gemini.npcTurn({
        persona: req.params.npcId,
        missionGoal: null,
        targetPhrases: [],
        requiredPhrases: [],
        level: 1,
        text: req.body?.text,
      });
      res.json(turn);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
