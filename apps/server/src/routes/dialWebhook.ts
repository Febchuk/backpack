import { Router } from "express";
import type { Deps } from "../app";

/** L0 stub. Backend lane: grade transcript, master phrases, unlock market. */
export function dialWebhookRouter(_deps: Deps) {
  const r = Router();
  r.post("/dial/webhook", (_req, res) => res.json({ ok: true }));
  return r;
}
