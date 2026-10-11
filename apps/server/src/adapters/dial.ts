import type { Config } from "../config";
import type { DialAdapter, DialCallInput, DialCallRecord } from "./types";

export const DIAL_API_URL = "https://api.getdial.ai";

/** In-memory Dial mock: records calls and SMS and returns `mock_` ids. Routes write the matching events rows. */
export function createMockDialAdapter() {
  const calls: DialCallInput[] = [];
  const sms: { to: string; body: string }[] = [];
  /** Finished-call transcripts keyed by call id. Each placed call starts empty; tests may overwrite. */
  const records = new Map<string, DialCallRecord>();
  const adapter: DialAdapter = {
    async call(input) {
      calls.push(input);
      const call_id = `mock_call_${calls.length}`;
      records.set(call_id, { id: call_id, turns: [] });
      console.log(`[dial:mock] ${input.kind} call to ${input.to} (${call_id})`);
      return { call_id };
    },
    async sms(input) {
      sms.push(input);
      const id = `mock_sms_${sms.length}`;
      console.log(`[dial:mock] sms to ${input.to}: ${input.body}`);
      return { id };
    },
    async getCall(callId) {
      const rec = records.get(callId);
      if (!rec) throw new Error(`Dial mock: no call ${callId}`);
      return rec;
    },
  };
  return { adapter, calls, sms, records };
}

/** Dial's `transcriptTurns` → our turns. agent → luna, user → player; transfer_target and empty turns are dropped. */
export function mapTranscriptTurns(turns: unknown): DialCallRecord["turns"] {
  if (!Array.isArray(turns)) return [];
  const out: DialCallRecord["turns"] = [];
  for (const t of turns as { speaker?: unknown; text?: unknown }[]) {
    if (typeof t?.text !== "string" || !t.text.trim()) continue;
    if (t.speaker === "agent") out.push({ speaker: "luna", text: t.text });
    else if (t.speaker === "user") out.push({ speaker: "player", text: t.text });
  }
  return out;
}

function errorMessage(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const m = (err as { message?: unknown }).message;
      return typeof m === "string" ? m : JSON.stringify(err);
    }
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

/** Minimal fetch client for the Dial REST API. The key only ever goes into the Authorization header. */
export function dialFetcher(apiKey: string, baseUrl = DIAL_API_URL) {
  return async function dialFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep raw text */
    }
    if (!res.ok) throw new Error(`Dial ${method} ${path} failed: ${res.status} ${errorMessage(parsed)}`);
    return parsed as T;
  };
}

/** Some Dial responses wrap the object (`{message: {...}}`, `{call: {...}}`); others return it bare. */
function unwrap(body: unknown, key: string): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const inner = b[key];
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : b;
}

export function createRealDialAdapter(config: Config): DialAdapter {
  if (!config.dialApiKey) throw new Error("MOCK_DIAL=0 but DIAL_API_KEY is not set");
  if (!config.dialFromNumberId) throw new Error("MOCK_DIAL=0 but DIAL_FROM_NUMBER_ID is not set");
  const dial = dialFetcher(config.dialApiKey);
  const fromNumberId = config.dialFromNumberId;

  return {
    async call({ to, instruction }) {
      const res = await dial("POST", "/v1/calls", {
        to,
        fromNumberId,
        outboundInstruction: instruction,
        language: config.dialCallLanguage,
        maxCallDurationSeconds: 90,
      });
      const id = unwrap(res, "call").id;
      if (typeof id !== "string") throw new Error("Dial POST /v1/calls: response has no call id");
      return { call_id: id };
    },
    async sms({ to, body }) {
      const res = await dial("POST", "/v1/messages", { to, fromNumberId, body });
      const id = unwrap(res, "message").id;
      if (typeof id !== "string") throw new Error("Dial POST /v1/messages: response has no message id");
      return { id };
    },
    async getCall(callId) {
      const res = await dial("GET", `/v1/calls/${encodeURIComponent(callId)}`);
      const call = unwrap(res, "call");
      return { id: typeof call.id === "string" ? call.id : callId, turns: mapTranscriptTurns(call.transcriptTurns) };
    },
  };
}

export function createDialAdapter(config: Config): DialAdapter {
  return config.mockDial ? createMockDialAdapter().adapter : createRealDialAdapter(config);
}
