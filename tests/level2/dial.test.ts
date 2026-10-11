import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PlayerState } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { recordingDial } from "../helpers/fakes";

const SECRET = "whsec_test";
let s: TestServer;
let dial: ReturnType<typeof recordingDial>;
beforeEach(async () => {
  dial = recordingDial();
  s = await startTestServer({ dial: dial.adapter });
  s.deps.config.dialWebhookSecret = SECRET;
});
afterEach(() => s.close());

const PHONE = "+15550001111";
async function activatedPlayer() {
  const id = PlayerState.parse(await (await s.post("/players")).json()).player.id;
  await s.post("/activate", { player_id: id, phone: PHONE });
  return id;
}

function signed(body: unknown, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, signature: `t=${t},v1=${v1}` };
}

async function deliver(body: Record<string, unknown>, opts: { secret?: string; eventId?: string } = {}) {
  const { raw, signature } = signed(body, opts.secret);
  return fetch(`${s.url}/dial/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dial-event-type": String(body.type),
      "x-dial-event-id": opts.eventId ?? String(body.id),
      "x-dial-signature": signature,
    },
    body: raw,
  });
}

const transcribed = (callId: string, eventId = `evt_${callId}`) => ({
  id: eventId,
  object: "event",
  type: "call.transcribed",
  version: 1,
  createdAt: new Date().toISOString(),
  relatedObject: { id: callId, type: "call", url: `/api/v1/calls/${callId}` },
  data: { callId },
});

const state = async (id: string) => PlayerState.parse(await (await s.get(`/state/${id}`)).json());

describe("L2 Dial webhook (real Dial envelope)", () => {
  it("call.transcribed → fetch call → grade debrief → market unlocks", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    await s.post("/skip-evening", { player_id: id });
    const debrief = dial.calls.find((c) => c.kind === "debrief")!;
    expect(debrief).toBeTruthy();
    const callId = `mock_call_${dial.calls.indexOf(debrief) + 1}`;
    dial.records.set(callId, {
      id: callId,
      turns: [
        { speaker: "luna", text: "Répète : c'est combien ?" },
        { speaker: "player", text: "C'est combien ?" },
      ],
    });
    const res = await deliver(transcribed(callId));
    expect(res.status).toBe(200);
    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === "c'est combien ?")?.status).toBe("mastered");
    expect(st.unlocks).toContain("market");
  });

  it("rejects a bad signature with 401 and changes nothing", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    await s.post("/skip-evening", { player_id: id });
    dial.records.set("mock_call_2", { id: "mock_call_2", turns: [{ speaker: "player", text: "c'est combien ?" }] });
    const res = await deliver(transcribed("mock_call_2"), { secret: "whsec_wrong" });
    expect(res.status).toBe(401);
    expect((await state(id)).unlocks).not.toContain("market");
  });

  it("is idempotent on X-Dial-Event-ID (a redelivery is a 200 no-op)", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    await s.post("/skip-evening", { player_id: id });
    dial.records.set("mock_call_2", { id: "mock_call_2", turns: [{ speaker: "player", text: "c'est combien ?" }] });
    expect((await deliver(transcribed("mock_call_2", "evt_same"))).status).toBe(200);
    expect((await deliver(transcribed("mock_call_2", "evt_same"))).status).toBe(200);
    const callEvents = s.deps.db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE player_id = ? AND source = 'call' AND payload LIKE '%evt_same%'")
      .get(id) as { n: number };
    expect(callEvents.n).toBe(1);
  });

  it("acknowledges (200) events it doesn't act on: webhook.ping, call.ended, unknown call ids", async () => {
    expect((await deliver({ id: "evt_ping", type: "webhook.ping", data: {} })).status).toBe(200);
    expect((await deliver({ id: "evt_end", type: "call.ended", data: { callId: "mock_call_x" } })).status).toBe(200);
    expect((await deliver(transcribed("call_unknown"))).status).toBe(200);
  });

  it("still accepts the normalized DialTranscript shape (used by the e2e and mocks)", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const res = await s.post("/dial/webhook", {
      call_id: "mock_call_1",
      player_id: id,
      kind: "debrief",
      turns: [{ speaker: "player", text: "c'est combien ?" }],
    });
    expect(res.status).toBe(200);
    expect((await state(id)).unlocks).toContain("market");
  });
});

describe("L2 Dial calls", () => {
  it("intro and debrief calls go to the player's phone with Luna's instruction", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["s'il vous plaît"]);
    await s.post("/skip-evening", { player_id: id });
    expect(dial.calls.map((c) => c.kind)).toEqual(["intro", "debrief"]);
    expect(dial.calls.every((c) => c.to === PHONE && c.player_id === id)).toBe(true);
    expect(dial.calls[1].instruction).toContain("s'il vous plaît");
  });
});

describe("L2 MCP per-call authorization (X-Dial-User-Number)", () => {
  async function mcpAs(userNumber: string | null) {
    const headers: Record<string, string> = {};
    if (userNumber) {
      headers["X-Dial-User-Number"] = userNumber;
      headers["X-Dial-Direction"] = "outbound";
    }
    const client = new Client({ name: "dial", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`), { requestInit: { headers } }));
    return client;
  }

  it("a caller whose number matches the player can read and write that player", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const c = await mcpAs(PHONE);
    const r = await c.callTool({ name: "get_missed_phrases", arguments: { player_id: id } });
    expect(r.isError).toBeFalsy();
    expect(JSON.stringify(r.content)).toContain("c'est combien ?");
    await c.close();
  });

  it("a caller with a different number is refused for another player's data", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const c = await mcpAs("+15559999999");
    const r = await c.callTool({ name: "unlock_district", arguments: { player_id: id, district: "market" } });
    expect(r.isError).toBe(true);
    await c.close();
    expect((await state(id)).unlocks).not.toContain("market");
  });

  it("a caller can omit player_id: the player is resolved from X-Dial-User-Number", async () => {
    const id = await activatedPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const c = await mcpAs(PHONE);
    const r = await c.callTool({ name: "get_missed_phrases", arguments: {} });
    expect(JSON.stringify(r.content)).toContain("c'est combien ?");
    await c.close();
  });

  it("district and mission ids are validated against the contract enums", async () => {
    const id = await activatedPlayer();
    const c = await mcpAs(PHONE);
    const r = await c.callTool({ name: "unlock_district", arguments: { player_id: id, district: "louvre" } });
    expect(r.isError).toBe(true);
    await c.close();
  });
});
