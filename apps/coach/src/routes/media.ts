import { Router } from "express";
import type { Deps } from "../app";

/** Lane C: GET /media/:id.mp3 — public voice notes for Dial to fetch. */
export function mediaRouter(_deps: Deps) {
  const r = Router();
  r.get("/media/:file", (_req, res) => res.status(501).json({ ok: false, error: "not implemented (lane C)" }));
  return r;
}
