import { Router } from "express";
import { DialTranscript, normalizePhrase } from "@backpack/shared";
import type { Deps } from "../app";

/** Missed phrases the player says correctly become mastered; on a debrief, any such phrase unlocks the market. */
export function dialWebhookRouter(deps: Deps) {
  const r = Router();
  r.post("/dial/webhook", (req, res) => {
    const body = DialTranscript.safeParse(req.body);
    if (!body.success) return res.status(400).json({ ok: false, error: body.error.message });
    const t = body.data;
    if (!deps.repo.playerExists(t.player_id)) return res.status(404).json({ ok: false, error: "unknown player" });
    const said = t.turns.filter((turn) => turn.speaker === "player").map((turn) => ` ${normalizePhrase(turn.text)} `);
    const mastered = deps.repo.missedPhrases(t.player_id).filter((p) => said.some((s) => s.includes(` ${normalizePhrase(p)} `)));
    for (const p of mastered) deps.repo.markMastered(t.player_id, p);
    if (t.kind === "debrief" && mastered.length > 0) deps.repo.unlock(t.player_id, "market");
    deps.repo.addEvent(t.player_id, "call", { ...t, mastered });
    res.json({ ok: true });
  });
  return r;
}
