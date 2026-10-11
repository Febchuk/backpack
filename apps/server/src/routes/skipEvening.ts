import { Router } from "express";
import { SkipEveningRequest } from "@backpack/shared";
import type { Deps } from "../app";
import { debriefInstruction } from "../luna/instructions";

export function skipEveningRouter(deps: Deps) {
  const r = Router();
  r.post("/skip-evening", async (req, res, next) => {
    const body = SkipEveningRequest.safeParse(req.body);
    if (!body.success) return res.status(400).json({ ok: false, error: body.error.message });
    const { player_id } = body.data;
    const st = deps.repo.getState(player_id);
    if (!st) return res.status(404).json({ ok: false, error: "unknown player" });
    if (!st.player.phone) return res.status(409).json({ ok: false, error: "player has no phone yet" });
    try {
      const instruction = debriefInstruction(deps.repo.missedPhrases(player_id));
      const { call_id } = await deps.adapters.dial.call({ to: st.player.phone, kind: "debrief", instruction, player_id });
      deps.repo.addEvent(player_id, "call", { type: "placed", call_id, kind: "debrief" });
      res.json({ ok: true, call_id });
    } catch (e) {
      next(e);
    }
  });
  return r;
}
