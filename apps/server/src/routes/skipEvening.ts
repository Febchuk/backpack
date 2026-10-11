import { Router } from "express";
import type { Deps } from "../app";

/** L0 stub. Backend lane: place debrief call with missed phrases in the instruction. */
export function skipEveningRouter(deps: Deps) {
  const r = Router();
  r.post("/skip-evening", async (_req, res) => {
    const { call_id } = await deps.adapters.dial.call({ to: "", kind: "debrief", instruction: "", player_id: "" });
    res.json({ ok: true, call_id });
  });
  return r;
}
