import { Router } from "express";
import type { Deps } from "../app";

export function playersRouter(deps: Deps) {
  const r = Router();
  r.post("/players", (_req, res) => {
    const id = deps.repo.createPlayer();
    res.json(deps.repo.getState(id));
  });
  return r;
}
