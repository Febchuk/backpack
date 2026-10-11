import type { Config } from "../config";
import type { DialClient, DialNumber, TranscriptTurn } from "../coach/contract";

export const DIAL_API_URL = "https://api.getdial.ai";

/** In-memory Dial: records sends, calls and purchases. Purchased numbers become `ready` on the first `getNumber`. */
export function createMockDial() {
  const messages: { from: string; to: string; body?: string; mediaUrls?: string[] }[] = [];
  const calls: { from: string; to: string; language: string; instruction: string }[] = [];
  const numbers = new Map<string, DialNumber>();
  /** Finished-call transcripts keyed by call id. Tests may overwrite. */
  const records = new Map<string, TranscriptTurn[]>();
  const client: DialClient = {
    async sendMessage(input) {
      messages.push(input);
      return { id: `mock_msg_${messages.length}` };
    },
    async placeCall(input) {
      calls.push(input);
      const call_id = `mock_call_${calls.length}`;
      records.set(call_id, []);
      return { call_id };
    },
    async getCall(callId) {
      const turns = records.get(callId);
      if (!turns) throw new Error(`Dial mock: no call ${callId}`);
      return { id: callId, turns };
    },
    async purchaseNumber() {
      const n = numbers.size + 1;
      const num: DialNumber = { id: `mock_num_${n}`, number: null, setupStatus: "provisioning" };
      numbers.set(num.id, num);
      return { ...num };
    },
    async getNumber(id) {
      const num = numbers.get(id);
      if (!num) throw new Error(`Dial mock: no number ${id}`);
      if (num.setupStatus === "provisioning") Object.assign(num, { setupStatus: "ready", number: `+1555010${String(numbers.size).padStart(4, "0")}` });
      return { ...num };
    },
  };
  return { client, messages, calls, numbers, records };
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
      headers: { Authorization: `Bearer ${apiKey}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
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

/** Some Dial responses wrap the object (`{message: {...}}`); others return it bare. */
function unwrap(body: unknown, key: string): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const inner = b[key];
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : b;
}

/** List responses come back bare or wrapped (`{numbers: [...]}`, `{data: [...]}`). */
function listOf(body: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(body)) return body;
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of [key, "data", "items"]) if (Array.isArray(b[k])) return b[k] as Record<string, unknown>[];
  return [];
}

function toNumber(raw: Record<string, unknown>): DialNumber {
  const status = raw.setupStatus ?? raw.setup_status;
  return {
    id: String(raw.id),
    number: typeof raw.number === "string" && raw.number ? raw.number : null,
    setupStatus: status === "failed" || status === "banned" ? "failed" : status === "provisioning" ? "provisioning" : "ready",
  };
}

/** Dial's transcriptTurns (agent/user) → ours; falls back to the flat "User: …" / "Agent: …" transcript. */
export function parseTranscript(call: Record<string, unknown>): TranscriptTurn[] {
  const out: TranscriptTurn[] = [];
  if (Array.isArray(call.transcriptTurns)) {
    for (const t of call.transcriptTurns as { speaker?: unknown; text?: unknown }[]) {
      if (typeof t?.text !== "string" || !t.text.trim()) continue;
      if (t.speaker === "agent") out.push({ speaker: "agent", text: t.text });
      else if (t.speaker === "user") out.push({ speaker: "learner", text: t.text });
    }
    return out;
  }
  if (typeof call.transcript !== "string") return out;
  for (const line of call.transcript.split("\n")) {
    const m = /^(User|Agent):\s*(.*)$/.exec(line.trim());
    if (m && m[2].trim() && m[2].trim() !== "(unintelligible audio)") out.push({ speaker: m[1] === "Agent" ? "agent" : "learner", text: m[2].trim() });
    else if (!m && line.trim() && out.length) out[out.length - 1].text += ` ${line.trim()}`;
  }
  return out;
}

export function createRealDial(config: Config): DialClient {
  if (!config.dialApiKey) throw new Error("MOCK_DIAL=0 but DIAL_API_KEY is not set");
  const dial = dialFetcher(config.dialApiKey);
  return {
    async sendMessage({ from, to, body, mediaUrls }) {
      const res = await dial("POST", "/v1/messages", { to, fromNumber: from, ...(body ? { body } : {}), ...(mediaUrls?.length ? { mediaUrls } : {}) });
      const id = unwrap(res, "message").id;
      if (typeof id !== "string") throw new Error("Dial POST /v1/messages: response has no message id");
      return { id };
    },
    async placeCall({ from, to, language, instruction }) {
      const res = await dial("POST", "/v1/calls", { to, fromNumberId: from, outboundInstruction: instruction, language, maxCallDurationSeconds: 600 });
      const id = unwrap(res, "call").id;
      if (typeof id !== "string") throw new Error("Dial POST /v1/calls: response has no call id");
      return { call_id: id };
    },
    async getCall(callId) {
      const call = unwrap(await dial("GET", `/v1/calls/${encodeURIComponent(callId)}`), "call");
      return { id: typeof call.id === "string" ? call.id : callId, turns: parseTranscript(call) };
    },
    async purchaseNumber({ consent, imessage, areaCode, nickname }) {
      const res = await dial("POST", "/v1/numbers", {
        explicitProgrammaticConsent: consent,
        ...(imessage ? { capabilities: ["imessage"] } : areaCode ? { areaCode } : {}),
        ...(nickname ? { nickname } : {}),
      });
      return toNumber(unwrap(res, "number"));
    },
    async getNumber(id) {
      // No get-by-id endpoint is documented; list and find.
      const raw = listOf(await dial("GET", "/v1/numbers"), "numbers").find((n) => n.id === id);
      if (!raw) throw new Error(`Dial: number ${id} not found on this account`);
      return toNumber(raw);
    },
  };
}

export function createDial(config: Config): DialClient {
  return config.mockDial ? createMockDial().client : createRealDial(config);
}
