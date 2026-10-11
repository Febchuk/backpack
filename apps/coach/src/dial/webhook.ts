import { Router } from "express";
import type { Deps } from "../app";

/** Lane A: POST /dial/webhook — signed `message.received` → engine; `call.ended` → transcript → memory. */
export function dialWebhookRouter(_deps: Deps) {
  const r = Router();
  r.post("/dial/webhook", (_req, res) => res.status(501).json({ ok: false, error: "not implemented (lane A)" }));
  return r;
}
