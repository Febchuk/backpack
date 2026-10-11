import crypto from "node:crypto";
import { Router, type Request } from "express";
import { DialTranscript, normalizePhrase } from "@backpack/shared";
import type { Deps } from "../app";

const MAX_SIGNATURE_AGE_S = 300;

/**
 * Missed phrases the player says correctly become mastered; on a debrief, any such phrase unlocks the market.
 * Stores the transcript as a `call` event. Shared by both webhook body shapes.
 */
export function gradeTranscript(deps: Deps, t: DialTranscript, extra: Record<string, unknown> = {}): string[] {
  const said = t.turns.filter((turn) => turn.speaker === "player").map((turn) => ` ${normalizePhrase(turn.text)} `);
  const mastered = deps.repo.missedPhrases(t.player_id).filter((p) => said.some((s) => s.includes(` ${normalizePhrase(p)} `)));
  for (const p of mastered) deps.repo.markMastered(t.player_id, p);
  if (t.kind === "debrief" && mastered.length > 0) deps.repo.unlock(t.player_id, "market");
  deps.repo.addEvent(t.player_id, "call", { ...t, mastered, ...extra });
  return mastered;
}

/** Verifies `X-Dial-Signature: t=<unix>,v1=<hex>` as HMAC-SHA256(secret, `${t}.${rawBody}`), at most 300 s old. */
export function verifyDialSignature(secret: string, header: string | undefined, rawBody: string, nowS = Date.now() / 1000) {
  if (!header) return false;
  let t: string | undefined;
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1s.length === 0) return false;
  if (Math.abs(nowS - Number(t)) > MAX_SIGNATURE_AGE_S) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  return v1s.some((v) => {
    if (!/^[0-9a-f]+$/i.test(v)) return false;
    const got = Buffer.from(v, "hex");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

type Envelope = { id?: unknown; type?: unknown; data?: { callId?: unknown }; relatedObject?: { id?: unknown } };

function isDialDelivery(req: Request): boolean {
  if (req.get("x-dial-signature") || req.get("x-dial-event-id") || req.get("x-dial-event-type")) return true;
  const b = req.body as Envelope | undefined;
  return !!b && typeof b === "object" && typeof b.type === "string" && typeof b.id === "string" && !("call_id" in b);
}

export function dialWebhookRouter(deps: Deps) {
  const r = Router();
  /** Event ids being processed right now, so a concurrent redelivery can't grade twice. */
  const inFlight = new Set<string>();

  r.post("/dial/webhook", async (req, res) => {
    if (!isDialDelivery(req)) {
      // Shape 1: our normalized DialTranscript (mocks, tests, e2e).
      const body = DialTranscript.safeParse(req.body);
      if (!body.success) return res.status(400).json({ ok: false, error: body.error.message });
      if (!deps.repo.playerExists(body.data.player_id)) return res.status(404).json({ ok: false, error: "unknown player" });
      gradeTranscript(deps, body.data);
      return res.json({ ok: true });
    }

    // Shape 2: a Dial event envelope. Never 404: Dial retries anything that isn't 2xx.
    const secret = deps.config.dialWebhookSecret;
    if (secret) {
      const raw: string = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      if (!verifyDialSignature(secret, req.get("x-dial-signature"), raw))
        return res.status(401).json({ ok: false, error: "bad signature" });
    }

    const env = (req.body ?? {}) as Envelope;
    const type = req.get("x-dial-event-type") ?? (typeof env.type === "string" ? env.type : "");
    const eventId = req.get("x-dial-event-id") ?? (typeof env.id === "string" ? env.id : "");
    if (type !== "call.transcribed") return res.json({ ok: true, ignored: type || "unknown event" });

    const callId = typeof env.data?.callId === "string" ? env.data.callId : typeof env.relatedObject?.id === "string" ? env.relatedObject.id : "";
    const placed = callId ? deps.repo.findPlacedCall(callId) : null;
    if (!placed) return res.json({ ok: true, ignored: "unknown call" });
    if (!eventId) return res.json({ ok: true, ignored: "no event id" });
    if (inFlight.has(eventId) || deps.repo.hasDialEvent(eventId)) return res.json({ ok: true, duplicate: true });

    inFlight.add(eventId);
    try {
      const record = await deps.adapters.dial.getCall(callId);
      const mastered = gradeTranscript(
        deps,
        { call_id: callId, player_id: placed.player_id, kind: placed.kind, turns: record.turns },
        { dial_event_id: eventId },
      );
      res.json({ ok: true, mastered });
    } catch (e) {
      // 5xx so Dial redelivers once the transcript can be fetched.
      console.error("[dial:webhook] getCall failed:", e instanceof Error ? e.message : e);
      res.status(502).json({ ok: false, error: "could not fetch the call transcript" });
    } finally {
      inFlight.delete(eventId);
    }
  });
  return r;
}
