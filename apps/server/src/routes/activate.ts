import { Router } from "express";
import { ActivateRequest } from "@backpack/shared";
import type { Deps } from "../app";
import { introInstruction } from "../luna/instructions";
import { LUNA_COFFEE_SMS } from "../luna/persona";

export function activateRouter(deps: Deps) {
  const r = Router();
  r.post("/activate", async (req, res, next) => {
    const body = ActivateRequest.safeParse(req.body);
    if (!body.success) return res.status(400).json({ ok: false, error: body.error.message });
    const { player_id, phone } = body.data;
    if (!deps.repo.playerExists(player_id)) return res.status(404).json({ ok: false, error: "unknown player" });
    try {
      deps.repo.setPhone(player_id, phone);
      const { call_id } = await deps.adapters.dial.call({ to: phone, kind: "intro", instruction: introInstruction(), player_id });
      deps.repo.addEvent(player_id, "call", { call_id, kind: "intro", status: "placed" });
      await deps.adapters.dial.sms({ to: phone, body: LUNA_COFFEE_SMS });
      deps.repo.addEvent(player_id, "sms", { body: LUNA_COFFEE_SMS });
      res.json({ ok: true, call_id });
    } catch (e) {
      next(e);
    }
  });
  return r;
}
