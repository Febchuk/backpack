import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { loadConfig } from "../../apps/server/src/config";
import { createMockDialAdapter, createRealDialAdapter } from "../../apps/server/src/adapters/dial";
import { verifyDialSignature } from "../../apps/server/src/routes/dialWebhook";
import { debriefInstruction, introInstruction } from "../../apps/server/src/luna/instructions";

const cfg = (o = {}) =>
  loadConfig({ mockDial: false, dialApiKey: "sk_live_SECRET", dialFromNumberId: "pn_1", dialCallLanguage: "fr-FR", ...o });

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("L2 backend: real Dial adapter (fetch stubbed, no network)", () => {
  it("fails fast without a key or from-number id", () => {
    expect(() => createRealDialAdapter(cfg({ dialApiKey: undefined }))).toThrow(/DIAL_API_KEY/);
    expect(() => createRealDialAdapter(cfg({ dialFromNumberId: undefined }))).toThrow(/DIAL_FROM_NUMBER_ID/);
  });

  it("call → POST /v1/calls with fromNumberId, outboundInstruction, language", async () => {
    const calls = stubFetch(201, { id: "call_123", status: { state: "Queued" } });
    const r = await createRealDialAdapter(cfg()).call({ to: "+15550001111", kind: "intro", instruction: "hi", player_id: "p" });
    expect(r).toEqual({ call_id: "call_123" });
    expect(calls[0].url).toBe("https://api.getdial.ai/v1/calls");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      to: "+15550001111",
      fromNumberId: "pn_1",
      outboundInstruction: "hi",
      language: "fr-FR",
      maxCallDurationSeconds: 90,
    });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_SECRET");
  });

  it("sms → POST /v1/messages and reads message.id", async () => {
    const calls = stubFetch(201, { message: { id: "msg_1" } });
    expect(await createRealDialAdapter(cfg()).sms({ to: "+1555", body: "yo" })).toEqual({ id: "msg_1" });
    expect(calls[0].url).toBe("https://api.getdial.ai/v1/messages");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ to: "+1555", fromNumberId: "pn_1", body: "yo" });
  });

  it("getCall maps agent→luna, user→player and drops transfer_target", async () => {
    stubFetch(200, {
      id: "call_9",
      transcriptTurns: [
        { speaker: "agent", text: "Bonsoir", startMs: 0, endMs: 1 },
        { speaker: "user", text: "C'est combien ?", startMs: 2, endMs: 3 },
        { speaker: "transfer_target", text: "Hello?", startMs: 4, endMs: 5 },
      ],
    });
    expect(await createRealDialAdapter(cfg()).getCall("call_9")).toEqual({
      id: "call_9",
      turns: [
        { speaker: "luna", text: "Bonsoir" },
        { speaker: "player", text: "C'est combien ?" },
      ],
    });
  });

  it("errors carry the status and Dial's error message, never the key", async () => {
    stubFetch(409, { error: { message: "calling_disabled" } });
    const err = await createRealDialAdapter(cfg())
      .call({ to: "+1", kind: "intro", instruction: "x", player_id: "p" })
      .catch((e: Error) => e);
    expect(String(err)).toMatch(/409/);
    expect(String(err)).toMatch(/calling_disabled/);
    expect(String(err)).not.toContain("sk_live_SECRET");
  });

  it("the mock adapter stores an empty transcript per placed call", async () => {
    const m = createMockDialAdapter();
    const { call_id } = await m.adapter.call({ to: "+1", kind: "intro", instruction: "x", player_id: "p" });
    expect(await m.adapter.getCall(call_id)).toEqual({ id: call_id, turns: [] });
    m.records.set(call_id, { id: call_id, turns: [{ speaker: "player", text: "bonjour" }] });
    expect((await m.adapter.getCall(call_id)).turns).toHaveLength(1);
  });
});

describe("L2 backend: webhook signature", () => {
  const sign = (raw: string, t: number, secret = "whsec_x") =>
    `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
  const now = Math.floor(Date.now() / 1000);

  it("accepts a fresh, correct signature and rejects stale, wrong or malformed ones", () => {
    expect(verifyDialSignature("whsec_x", sign("{}", now), "{}")).toBe(true);
    expect(verifyDialSignature("whsec_x", sign("{}", now - 301), "{}")).toBe(false);
    expect(verifyDialSignature("whsec_x", sign("{}", now, "whsec_y"), "{}")).toBe(false);
    expect(verifyDialSignature("whsec_x", sign("{}", now), "{ }")).toBe(false);
    expect(verifyDialSignature("whsec_x", "garbage", "{}")).toBe(false);
    expect(verifyDialSignature("whsec_x", undefined, "{}")).toBe(false);
  });
});

describe("L2 backend: Luna's call instructions", () => {
  it("intro discloses AI; debrief drills only the hardest missed phrase and names the unlock tools", () => {
    expect(introInstruction()).toMatch(/IA|AI/);
    const d = debriefInstruction(["merci", "c'est combien ?"]);
    for (const s of ['"c\'est combien ?"', "mark_phrase_mastered", "unlock_district", '"market"']) expect(d).toContain(s);
    expect(d).not.toContain('"merci"');
  });
});

describe("L2 Dial transcript fallback", () => {
  it("parses the flat transcript when Dial omits transcriptTurns (seen live)", async () => {
    const { parseFlatTranscript } = await import("../../apps/server/src/adapters/dial");
    const flat = "User: (unintelligible audio)\nUser: bonjour \nAgent: Répète après moi : bonjour.\nUser: ça va \nAgent: Bravo !  \n\nTa mission: un café.\n";
    expect(parseFlatTranscript(flat)).toEqual([
      { speaker: "player", text: "bonjour" },
      { speaker: "luna", text: "Répète après moi : bonjour." },
      { speaker: "player", text: "ça va" },
      { speaker: "luna", text: "Bravo ! Ta mission: un café." },
    ]);
  });
});
