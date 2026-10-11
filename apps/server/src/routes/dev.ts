import { Router } from "express";
import type { Deps } from "../app";

export function devRouter(deps: Deps) {
  const r = Router();
  r.post("/dev/reset", (_req, res) => {
    deps.db.exec("DELETE FROM players; DELETE FROM phrases; DELETE FROM missions; DELETE FROM unlocks; DELETE FROM events;");
    res.json({ ok: true });
  });
  return r;
}
