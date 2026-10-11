import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NpcTurnResponse, PlayerState } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { npcTurn, recordingDial } from "../helpers/fakes";

const PHONE = "+15550001234";
let s: TestServer;
let dial: ReturnType<typeof recordingDial>;
beforeEach(async () => {
  dial = recordingDial();
  s = await startTestServer({ dial: dial.adapter });
});
afterEach(() => s.close());

const state = async (id: string) => PlayerState.parse(await (await s.get(`/state/${id}`)).json());
const statusOf = (st: PlayerState, text: string) => st.phrases.find((p) => p.text_fr === text)?.status;

/** Title → kiosk (SIM bought) → number entered → café order that skips "c'est combien ?" and "merci". */
async function playThroughCafe() {
  const id = PlayerState.parse(await (await s.post("/players")).json()).player.id;
  const kiosk = NpcTurnResponse.parse(await (await npcTurn(s.url, "clerk", id, "Bonjour, je voudrais une carte SIM, merci")).json());
  expect(kiosk.mission_complete).toBe(true);
  expect((await s.post("/activate", { player_id: id, phone: PHONE })).status).toBe(200);
  const cafe = NpcTurnResponse.parse(
    await (await npcTurn(s.url, "barista", id, "Bonjour, je voudrais un café, s'il vous plaît", "cafe_order")).json(),
  );
  expect(cafe.mission_complete).toBe(true);
  expect(cafe.phrases_missed).toEqual(expect.arrayContaining(["c'est combien ?"]));
  return id;
}

async function skipEvening(id: string) {
  const res = await s.post("/skip-evening", { player_id: id });
  expect(res.status).toBe(200);
  const { call_id } = (await res.json()) as { call_id: string };
  const call = dial.calls.at(-1)!;
  expect(call).toMatchObject({ kind: "debrief", to: PHONE, player_id: id });
  return { call_id, instruction: call.instruction };
}

async function mcpOnCall() {
  const client = new Client({ name: "dial-luna", version: "0.0.0" });
  const headers = { "X-Dial-User-Number": PHONE, "X-Dial-Direction": "outbound" };
  await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`), { requestInit: { headers } }));
  return client;
}

describe("L3 backend: café → skip evening → debrief → market", () => {
  it("café turns log phrases into /state: used → practicing/mastered, missed → missed", async () => {
    const id = await playThroughCafe();
    const st = await state(id);
    expect(statusOf(st, "c'est combien ?")).toBe("missed");
    expect(statusOf(st, "je voudrais un café")).toBe("practicing");
    expect(statusOf(st, "bonjour")).toBe("mastered"); // said at the kiosk, then again at the café
    expect(st.missions.find((m) => m.mission_key === "cafe_order")?.status).toBe("done");
    expect(st.unlocks).not.toContain("market");
  });

  it("the debrief instruction names the missed café phrase and Luna's unlock tools", async () => {
    const id = await playThroughCafe();
    const { instruction } = await skipEvening(id);
    for (const s of ['"c\'est combien ?"', "mark_phrase_mastered", "unlock_district", '"market"']) expect(instruction).toContain(s);
    expect(instruction).toMatch(/Luna/);
  });

  it("a debrief transcript where the player says the phrase masters it and unlocks market", async () => {
    const id = await playThroughCafe();
    const { call_id } = await skipEvening(id);
    const res = await s.post("/dial/webhook", {
      call_id,
      player_id: id,
      kind: "debrief",
      turns: [
        { speaker: "luna", text: "Bonsoir ! Répète : c'est combien ?" },
        { speaker: "player", text: "C'est combien ?" },
        { speaker: "luna", text: "Bravo ! Le marché est ouvert." },
      ],
    });
    expect(res.status).toBe(200);
    const st = await state(id);
    expect(statusOf(st, "c'est combien ?")).toBe("mastered");
    expect(statusOf(st, "merci")).toBe("missed"); // not said on the call
    expect(st.unlocks).toContain("market");
  });

  it("a debrief where the player still fumbles leaves the phrase missed and market locked", async () => {
    const id = await playThroughCafe();
    const { call_id } = await skipEvening(id);
    await s.post("/dial/webhook", {
      call_id,
      player_id: id,
      kind: "debrief",
      turns: [{ speaker: "luna", text: "C'est combien ?" }, { speaker: "player", text: "euh... combien" }],
    });
    const st = await state(id);
    expect(statusOf(st, "c'est combien ?")).toBe("missed");
    expect(st.unlocks).not.toContain("market");
  });

  it("the real Dial path (call.transcribed envelope → getCall) grades the same way", async () => {
    const id = await playThroughCafe();
    const { call_id } = await skipEvening(id);
    dial.records.set(call_id, { id: call_id, turns: [{ speaker: "player", text: "c'est combien" }] });
    const res = await fetch(`${s.url}/dial/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Dial-Event-Type": "call.transcribed", "X-Dial-Event-ID": "evt_l3" },
      body: JSON.stringify({ id: "evt_l3", type: "call.transcribed", data: { callId: call_id } }),
    });
    expect(res.status).toBe(200);
    const st = await state(id);
    expect(statusOf(st, "c'est combien ?")).toBe("mastered");
    expect(st.unlocks).toContain("market");
  });

  it("Luna's MCP tools on the call (no player_id) master the phrase and unlock market in /state", async () => {
    const id = await playThroughCafe();
    await skipEvening(id);
    const c = await mcpOnCall();
    const missed = await c.callTool({ name: "get_missed_phrases", arguments: {} });
    expect(JSON.stringify(missed.content)).toContain("c'est combien ?");
    // Luna may drop the space or the question mark: the normalized match still hits the café phrase.
    const m = await c.callTool({ name: "mark_phrase_mastered", arguments: { phrase: "C'est combien?" } });
    expect(m.isError).toBeFalsy();
    const u = await c.callTool({ name: "unlock_district", arguments: { district: "market" } });
    expect(u.isError).toBeFalsy();
    await c.close();

    const st = await state(id);
    expect(statusOf(st, "c'est combien ?")).toBe("mastered");
    expect(st.phrases.filter((p) => p.text_fr.toLowerCase().startsWith("c'est combien"))).toHaveLength(1);
    expect(st.unlocks).toContain("market");
  });

  it("MCP tools from a different phone cannot unlock this player's market", async () => {
    const id = await playThroughCafe();
    const c = new Client({ name: "stranger", version: "0.0.0" });
    await c.connect(
      new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`), { requestInit: { headers: { "X-Dial-User-Number": "+15559990000" } } }),
    );
    const r = await c.callTool({ name: "unlock_district", arguments: { player_id: id, district: "market" } });
    expect(r.isError).toBe(true);
    await c.close();
    expect((await state(id)).unlocks).not.toContain("market");
  });

  it("open-play turns (girard, margaux) log phrases with mission_complete null", async () => {
    const id = PlayerState.parse(await (await s.post("/players")).json()).player.id;
    const g = NpcTurnResponse.parse(await (await npcTurn(s.url, "girard", id, "Bonjour monsieur, ça va ?")).json());
    expect(g.mission_complete).toBeNull();
    const m = NpcTurnResponse.parse(await (await npcTurn(s.url, "margaux", id, "Un croissant")).json());
    expect(m.mission_complete).toBeNull();
    const st = await state(id);
    expect(statusOf(st, "ça va ?")).toBe("practicing");
    expect(statusOf(st, "un croissant")).toBe("practicing");
    expect(statusOf(st, "une baguette")).toBe("missed");
  });
});
