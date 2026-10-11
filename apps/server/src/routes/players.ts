import { Router } from "express";
import type { Deps } from "../app";
import fixture from "@backpack/shared/fixtures/playerState.new.json" with { type: "json" };

/** L0 stub: returns the new-player fixture. Backend lane: create player + missions in SQLite. */
export function playersRouter(_deps: Deps) {
  const r = Router();
  r.post("/players", (_req, res) => res.json(fixture));
  return r;
}
