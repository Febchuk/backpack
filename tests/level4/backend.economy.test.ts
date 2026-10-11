import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ECONOMY, NpcTurnResponse, PlayerState, starsForHints } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { npcTurn, recordingDial } from "../helpers/fakes";

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer({ dial: recordingDial().adapter });
});
afterEach(() => s.close());

const START_EUROS = 50;
const newPlayer = async () => PlayerState.parse(await (await s.post("/players")).json()).player.id;
const state = async (id: string) => PlayerState.parse(await (await s.get(`/state/${id}`)).json());
const euros = async (id: string) => (await state(id)).player.euros;
const mission = async (id: string, key: string) => (await state(id)).missions.find((m) => m.mission_key === key)!;
const turn = async (npc: string, id: string, text: string) => NpcTurnResponse.parse(await (await npcTurn(s.url, npc, id, text)).json());

const KIOSK_OK = "Bonjour, je voudrais une carte SIM, merci";
const CAFE_OK = "Bonjour, je voudrais un café, s'il vous plaît";

describe("L4 backend: stars from hints", () => {
  it("starsForHints: 3 with no hints, 2 with one, 1 with two or more", () => {
    expect([0, 1, 2, 5].map(starsForHints)).toEqual([3, 2, 1, 1]);
  });

  it("a mission completed with no hints gets 3 stars", async () => {
    const id = await newPlayer();
    expect((await turn("clerk", id, KIOSK_OK)).mission_complete).toBe(true);
    expect(await mission(id, "sim_kiosk")).toMatchObject({ status: "done", hints_used: 0, stars: 3 });
  });

  it("each hinted turn before completion costs a star, down to 1", async () => {
    const id = await newPlayer();
    await turn("clerk", id, "Bonjour"); // missing the SIM phrase → hint
    expect((await mission(id, "sim_kiosk")).hints_used).toBe(1);
    await turn("clerk", id, KIOSK_OK);
    expect((await mission(id, "sim_kiosk")).stars).toBe(2);

    await turn("barista", id, "euh"); // two hints at the café
    await turn("barista", id, "bonjour");
    await turn("barista", id, CAFE_OK);
    expect(await mission(id, "cafe_order")).toMatchObject({ status: "done", hints_used: 2, stars: 1 });
  });

  it("award_star still adds 1 on top of the completion stars, capped at 3", async () => {
    const id = await newPlayer();
    await turn("clerk", id, "Bonjour");
    await turn("clerk", id, KIOSK_OK);
    expect((await mission(id, "sim_kiosk")).stars).toBe(2);
    const c = new Client({ name: "luna", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
    await c.callTool({ name: "award_star", arguments: { player_id: id, mission_id: "sim_kiosk" } });
    expect((await mission(id, "sim_kiosk")).stars).toBe(3);
    await c.callTool({ name: "award_star", arguments: { player_id: id, mission_id: "sim_kiosk" } });
    expect((await mission(id, "sim_kiosk")).stars).toBe(3);
    await c.close();
  });

  it("repeating a done mission does not reset its stars or charge again", async () => {
    const id = await newPlayer();
    await turn("clerk", id, KIOSK_OK);
    const after = await euros(id);
    await turn("clerk", id, "Bonjour"); // a hinted turn on a done mission
    await turn("clerk", id, KIOSK_OK);
    expect((await mission(id, "sim_kiosk")).stars).toBe(3);
    expect(await euros(id)).toBe(after);
  });
});

describe("L4 backend: euros", () => {
  it("players start with 50 euros", async () => {
    expect(await euros(await newPlayer())).toBe(START_EUROS);
  });

  it("completing a mission subtracts its ECONOMY.missionCost", async () => {
    const id = await newPlayer();
    await turn("clerk", id, KIOSK_OK);
    expect(await euros(id)).toBe(START_EUROS - ECONOMY.missionCost.sim_kiosk);
    await turn("barista", id, CAFE_OK);
    expect(await euros(id)).toBe(START_EUROS - ECONOMY.missionCost.sim_kiosk - ECONOMY.missionCost.cafe_order);
  });

  it("a fumble with a cold NPC costs ECONOMY.fumblePenalty", async () => {
    const id = await newPlayer();
    const t = await turn("margaux", id, "Un croissant"); // no bonjour: Margaux turns cold
    expect(t.mood).toBe("cold");
    expect(t.phrases_missed.length).toBeGreaterThan(0);
    expect(await euros(id)).toBe(START_EUROS - ECONOMY.fumblePenalty);
  });

  it("missed phrases with a patient NPC cost nothing", async () => {
    const id = await newPlayer();
    const t = await turn("girard", id, "Bonjour");
    expect(t.mood).toBe("patient");
    expect(t.phrases_missed.length).toBeGreaterThan(0);
    expect(await euros(id)).toBe(START_EUROS);
  });

  it("mood alone does not cost: an impatient turn with nothing missed is free, one with a miss costs", async () => {
    const reply = (missed: string[]): NpcTurnResponse => ({
      reply_fr: "Vite !",
      reply_en_hint: "Quick!",
      heard: "",
      phrases_used: ["bonjour"],
      phrases_missed: missed,
      hint: "",
      mission_complete: null,
      mood: "impatient",
    });
    let next = reply([]);
    const stub = await startTestServer({ dial: recordingDial().adapter, gemini: { npcTurn: async () => next } });
    try {
      const id = PlayerState.parse(await (await stub.post("/players")).json()).player.id;
      const eurosOf = async () => PlayerState.parse(await (await stub.get(`/state/${id}`)).json()).player.euros;
      await npcTurn(stub.url, "theo", id, "bonjour");
      expect(await eurosOf()).toBe(START_EUROS);
      next = reply(["salut"]);
      await npcTurn(stub.url, "theo", id, "bonjour");
      expect(await eurosOf()).toBe(START_EUROS - ECONOMY.fumblePenalty);
    } finally {
      await stub.close();
    }
  });

  it("euros never go below 0", async () => {
    const id = await newPlayer();
    s.deps.repo.spendEuros(id, START_EUROS - 1);
    await turn("margaux", id, "Un croissant");
    await turn("margaux", id, "Un croissant");
    expect(await euros(id)).toBe(0);
    await turn("clerk", id, KIOSK_OK);
    expect(await euros(id)).toBe(0);
    s.deps.repo.spendEuros(id, 1000);
    expect(await euros(id)).toBe(0);
  });
});
