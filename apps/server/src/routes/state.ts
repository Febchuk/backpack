import { Router } from "express";
import type { Deps } from "../app";

export function stateRouter(deps: Deps) {
  const r = Router();
  r.get("/state/:playerId", (req, res) => {
    const st = deps.repo.getState(req.params.playerId);
    if (!st) return res.status(404).json({ ok: false, error: "unknown player" });
    res.json(st);
  });
  return r;
}
