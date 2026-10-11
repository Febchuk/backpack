import { Router } from "express";
import type { Deps } from "../app";

/** Lane E: the console API under /api (ADMIN_TOKEN bearer). See packages/shared/src/coach.ts for bodies. */
export function apiRouter(_deps: Deps) {
  const r = Router();
  r.all("/api/*", (_req, res) => res.status(501).json({ ok: false, error: "not implemented (lane E)" }));
  return r;
}
