import { Router } from "express";
import type { Deps } from "../app";
import fixture from "@backpack/shared/fixtures/playerState.new.json" with { type: "json" };

/** L0 stub. Backend lane: read PlayerState from SQLite. */
export function stateRouter(_deps: Deps) {
  const r = Router();
  r.get("/state/:playerId", (_req, res) => res.json(fixture));
  return r;
}
