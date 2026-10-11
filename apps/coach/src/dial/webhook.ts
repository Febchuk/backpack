import crypto from "node:crypto";
import { Router, type Request } from "express";
import type { Deps } from "../app";
import type { InboundMessage } from "../coach/contract";
import type { Learner } from "../db/repo";

const MAX_SIGNATURE_AGE_S = 300;

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

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** A `message.received` payload worth answering, or null (group, reaction, empty). */
export function normalizeMessage(data: Data): InboundMessage | null {
  const messageId = str(data.messageId);
  const from = str(data.from);
  const to = str(data.to);
  if (!messageId || !from || !to || data.groupId || data.reaction) return null;
  const media = (Array.isArray(data.media) ? (data.media as Data[]) : [])
    .filter((m) => str(m?.url))
    .map((m) => ({ url: m.url as string, contentType: str(m.contentType) ?? "application/octet-stream" }));
  const body = typeof data.body === "string" ? data.body : "";
  if (!body.trim() && !media.length) return null;
  return { messageId, from, to, body, media };
}

/** `Agent: …` / `Learner: …` lines. */
const transcriptText = (turns: { speaker: string; text: string }[]) =>
  turns.map((t) => `${t.speaker === "agent" ? "Agent" : "Learner"}: ${t.text}`).join("\n");

export function dialWebhookRouter(deps: Deps) {
  const { repo, engine, memory, dial } = deps;
  const r = Router();
  /** Event and message ids being processed right now, so a concurrent redelivery is a no-op. */
  const inFlight = new Set<string>();
  /** Calls that ended before their transcript was ready, awaiting `call.transcribed`. */
  const awaitingTranscript = new Map<string, string>();

  const log = (what: string, e: unknown) => console.error(`[coach:webhook] ${what}:`, e instanceof Error ? e.message : e);

  async function onMessage(eventId: string, data: Data) {
    const msg = normalizeMessage(data);
    if (!msg) return { ignored: "not an answerable message" };
    const agent = await repo.agentByNumber(msg.to);
    if (!agent) return { ignored: "number not owned by an agent" };
    const keys = [eventId, msg.messageId].filter(Boolean);
    if (keys.some((k) => inFlight.has(k))) return { duplicate: true };
    keys.forEach((k) => inFlight.add(k));
    const release = () => keys.forEach((k) => inFlight.delete(k));
    if (await repo.hasDialId(msg.messageId)) {
      release();
      return { duplicate: true };
    }

    void (async () => {
      const existing = await repo.learnerByPhone(agent.id, msg.from);
      if (existing) return engine.handleInbound(agent, existing, msg);
      const { learner, created } = await repo.upsertLearner(agent.id, msg.from);
      if (!created) return engine.handleInbound(agent, learner, msg);
      const first = await repo.addEvent({
        learner_id: learner.id,
        channel: msg.media.some((m) => m.contentType.startsWith("audio/")) ? "voice_note" : "sms",
        direction: "in",
        text: msg.body,
        media_url: msg.media[0]?.url ?? null,
        dial_id: msg.messageId,
      });
      if (first) await engine.startOnboarding(agent, learner);
    })()
      .catch((e) => log(`message ${msg.messageId} failed`, e))
      .finally(release);
    return { accepted: msg.messageId };
  }

  async function storeCall(callId: string, learner: Learner) {
    const { turns } = await dial.getCall(callId);
    if (!turns.length) return false;
    const ev = await repo.addEvent({ learner_id: learner.id, channel: "call", direction: "in", text: transcriptText(turns), dial_id: callId });
    if (ev) memory.remember(learner.id, ev.id).catch((e) => log(`remember call ${callId} failed`, e));
    return true;
  }

  async function onCallEnded(data: Data) {
    const callId = str(data.callId);
    const from = str(data.from);
    const to = str(data.to);
    if (!callId || !from || !to || data.status !== "completed") return { ignored: "no completed call" };
    const [agentNumber, learnerPhone] = data.direction === "outbound" ? [from, to] : [to, from];
    const agent = await repo.agentByNumber(agentNumber);
    const learner = agent && (await repo.learnerByPhone(agent.id, learnerPhone));
    if (!learner) return { ignored: "unknown agent or learner" };
    engine.afterCall?.(agent, learner, callId).catch((e) => log(`follow-up for ${callId} failed`, e));
    if (await repo.hasDialId(callId)) return { duplicate: true };
    if (await storeCall(callId, learner)) return { stored: callId };
    awaitingTranscript.set(callId, learner.id);
    return { awaiting_transcript: callId };
  }

  async function onCallTranscribed(data: Data) {
    const callId = str(data.callId);
    const learnerId = callId && awaitingTranscript.get(callId);
    const learner = learnerId && (await repo.getLearner(learnerId));
    if (!callId || !learner) return { ignored: "no pending call" };
    if (!(await repo.hasDialId(callId)) && !(await storeCall(callId, learner))) return { ignored: "empty transcript" };
    awaitingTranscript.delete(callId);
    return { stored: callId };
  }

  r.post("/dial/webhook", async (req: Request, res) => {
    const secret = deps.config.dialWebhookSecret;
    if (secret) {
      const raw = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      if (!verifyDialSignature(secret, req.get("x-dial-signature"), raw)) return res.status(401).json({ ok: false, error: "bad signature" });
    }
    // Never 4xx past this point: Dial retries anything that isn't 2xx.
    const env = (req.body ?? {}) as { id?: unknown; type?: unknown; data?: unknown };
    const type = req.get("x-dial-event-type") ?? str(env.type) ?? "";
    const eventId = req.get("x-dial-event-id") ?? str(env.id) ?? "";
    const data = (env.data && typeof env.data === "object" ? env.data : {}) as Data;
    try {
      if (type === "message.received") return res.json({ ok: true, ...(await onMessage(eventId, data)) });
      if (type === "call.ended") return res.json({ ok: true, ...(await onCallEnded(data)) });
      if (type === "call.transcribed") return res.json({ ok: true, ...(await onCallTranscribed(data)) });
      return res.json({ ok: true, ignored: type || "unknown event" });
    } catch (e) {
      // 5xx so Dial redelivers (e.g. the call transcript could not be fetched yet).
      log(`${type} ${eventId} failed`, e);
      return res.status(502).json({ ok: false, error: "processing failed" });
    }
  });
  return r;
}
