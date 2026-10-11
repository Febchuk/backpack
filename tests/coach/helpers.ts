import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { loadConfig, type Config } from "../../apps/coach/src/config";
import { createApp, createDeps, type Deps } from "../../apps/coach/src/app";
import { createMockDial } from "../../apps/coach/src/dial/client";
import type { Agent, Learner } from "../../apps/coach/src/db/repo";

export interface Coach {
  url: string;
  server: Server;
  deps: Deps;
  dial: ReturnType<typeof createMockDial>;
  close(): Promise<void>;
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  send(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
}

/** Boots the coach on an ephemeral port with in-memory PGlite and every adapter mocked. Hermetic: ignores .env keys. */
export async function startCoach(overrides: Partial<Omit<Deps, "config">> = {}, config: Partial<Config> = {}): Promise<Coach> {
  const dial = createMockDial();
  const cfg = loadConfig({
    mockGemini: true,
    mockDial: true,
    mockElevenLabs: true,
    databaseUrl: undefined,
    pgliteDir: undefined,
    dialWebhookSecret: undefined,
    dialSelfHostedSecret: undefined,
    adminToken: undefined,
    isProduction: false,
    ...config,
  });
  const deps = await createDeps(cfg, { dial: dial.client, ...overrides });
  const server: Server = await new Promise((resolve) => {
    const s = createApp(deps).listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Voice-note URLs must point back at this server.
  deps.config.publicUrl = url;
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(url + path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  return {
    url,
    server,
    deps,
    dial,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await deps.db.close();
    },
    get: (path) => fetch(url + path),
    post: (path, body = {}, headers) => send("POST", path, body, headers),
    send,
  };
}

export const AGENT_NUMBER = "+15550100001";
export const LEARNER_PHONE = "+447700900123";

/** An agent that is fully set up: voice, ElevenLabs agent, ready Dial number. */
export async function seedAgent(deps: Deps, patch: Partial<Agent> = {}): Promise<Agent> {
  const a = await deps.repo.createAgent({ name: "Camille", language: "fr-FR", persona_city: "Lyon" });
  return (await deps.repo.updateAgent(a.id, {
    voice_id: "voice_fr_camille",
    voice_source: "library",
    el_agent_id: "el_agent_camille",
    dial_number_id: "num_camille",
    dial_number: AGENT_NUMBER,
    setup_status: "ready",
    ...patch,
  }))!;
}

/** A learner who has finished onboarding (so texts get ordinary replies). */
export async function seedLearner(deps: Deps, agent: Agent, patch: Partial<Learner> = {}): Promise<Learner> {
  const { learner } = await deps.repo.upsertLearner(agent.id, LEARNER_PHONE, "Sam");
  return (await deps.repo.updateLearner(learner.id, { level: "A2", onboarding_step: "done", ...patch }))!;
}

let seq = 0;
/** A Dial `message.received` envelope, as delivered to the webhook. */
export function messageReceived(data: { from?: string; to?: string; body?: string; media?: { url: string; contentType: string }[]; reaction?: string | null; messageId?: string }) {
  const n = ++seq;
  const messageId = data.messageId ?? `msg_test_${Date.now()}_${n}`;
  return {
    id: `evt_test_${Date.now()}_${n}`,
    object: "event",
    type: "message.received",
    version: 1,
    createdAt: new Date().toISOString(),
    relatedObject: { id: messageId, type: "message", url: null },
    data: {
      messageId,
      from: data.from ?? LEARNER_PHONE,
      to: data.to ?? AGENT_NUMBER,
      groupId: null,
      channel: "imessage",
      body: data.body ?? "",
      media: (data.media ?? []).map((m, i) => ({ id: `media_${n}_${i}`, url: m.url, contentType: m.contentType, originalUrl: null })),
      replyToId: null,
      reaction: data.reaction ?? null,
      source: "external",
    },
  };
}

/** Headers Dial sends with a webhook delivery; signed when `secret` is given. */
export function dialHeaders(envelope: { id: string; type: string }, rawBody: string, secret?: string, t = Math.floor(Date.now() / 1000)) {
  const h: Record<string, string> = { "x-dial-event-id": envelope.id, "x-dial-event-type": envelope.type };
  if (secret) h["x-dial-signature"] = `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
  return h;
}

/** POSTs an envelope to /dial/webhook exactly as Dial would. */
export async function deliver(coach: Coach, envelope: { id: string; type: string }, secret?: string) {
  const raw = JSON.stringify(envelope);
  return coach.post("/dial/webhook", raw, dialHeaders(envelope, raw, secret));
}

export async function waitFor<T>(fn: () => T | undefined | null | false | Promise<T | undefined | null | false>, ms = 3_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
