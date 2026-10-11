import { Router } from "express";
import type { Deps } from "../app";

/** L0 stub. Backend lane: save phone, place intro call, send mission SMS. */
export function activateRouter(deps: Deps) {
  const r = Router();
  r.post("/activate", async (_req, res) => {
    const { call_id } = await deps.adapters.dial.call({ to: "", kind: "intro", instruction: "", player_id: "" });
    res.json({ ok: true, call_id });
  });
  return r;
}
