import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PlayerState } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { recordingDial } from "../helpers/fakes";

let s: TestServer;
let dial: ReturnType<typeof recordingDial>;
beforeEach(async () => {
  dial = recordingDial();
  s = await startTestServer({ dial: dial.adapter });
});
afterEach(() => s.close());

const newPlayer = async () => PlayerState.parse(await (await s.post("/players")).json()).player.id;
const state = async (id: string) => PlayerState.parse(await (await s.get(`/state/${id}`)).json());

describe("L1 backend lane", () => {
  it("POST /players persists a player; GET /state reads it back from SQLite", async () => {
    const id = await newPlayer();
    const st = await state(id);
    expect(st.player.id).toBe(id);
    expect(st.missions.find((m) => m.mission_key === "sim_kiosk")?.status).toBe("active");
    expect(st.missions.find((m) => m.mission_key === "cafe_order")?.status).toBe("locked");
  });

  it("GET /state for an unknown player is 404", async () => {
    expect((await s.get("/state/p_nope")).status).toBe(404);
  });

  it("POST /activate saves the phone, places an intro call, and texts the coffee mission", async () => {
    const id = await newPlayer();
    const res = await s.post("/activate", { player_id: id, phone: "+15550001111" });
    expect(res.status).toBe(200);
    expect(dial.calls).toHaveLength(1);
    expect(dial.calls[0]).toMatchObject({ to: "+15550001111", kind: "intro", player_id: id });
    expect(dial.calls[0].instruction).toMatch(/Luna/);
    expect(dial.calls[0].instruction).toMatch(/AI/);
    expect(dial.sms[0]?.to).toBe("+15550001111");
    const st = await state(id);
    expect(st.player.phone).toBe("+15550001111");
    expect(st.messages.length).toBeGreaterThanOrEqual(1);
    expect(st.messages.at(-1)!.body.toLowerCase()).toMatch(/caf[eé]|coffee/);
  });

  it("POST /activate validates its body", async () => {
    expect((await s.post("/activate", { player_id: "x" })).status).toBe(400);
    expect((await s.post("/activate", { player_id: "p_nope", phone: "+15550001111" })).status).toBe(404);
  });

  it("POST /skip-evening places a debrief call whose instruction names today's missed phrases", async () => {
    const id = await newPlayer();
    await s.post("/activate", { player_id: id, phone: "+15550001111" });
    s.deps.repo.logTurn(id, ["bonjour"], ["c'est combien ?"]);
    const res = await s.post("/skip-evening", { player_id: id });
    expect(res.status).toBe(200);
    const debrief = dial.calls.find((c) => c.kind === "debrief")!;
    expect(debrief.to).toBe("+15550001111");
    expect(debrief.instruction).toContain("c'est combien ?");
  });

  it("POST /dial/webhook grades a debrief: phrase said correctly → mastered → market unlocked", async () => {
    const id = await newPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const res = await s.post("/dial/webhook", {
      call_id: "mock_call_1",
      player_id: id,
      kind: "debrief",
      turns: [
        { speaker: "luna", text: "Répète : c'est combien ?" },
        { speaker: "player", text: "C'est combien ?" },
      ],
    });
    expect(res.status).toBe(200);
    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === "c'est combien ?")?.status).toBe("mastered");
    expect(st.unlocks).toContain("market");
  });

  it("POST /dial/webhook does not unlock when the player still misses the phrase", async () => {
    const id = await newPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    await s.post("/dial/webhook", {
      call_id: "mock_call_1",
      player_id: id,
      kind: "debrief",
      turns: [{ speaker: "player", text: "euh... je sais pas" }],
    });
    expect((await state(id)).unlocks).not.toContain("market");
  });

  it("MCP: exposes the five tools and they read/write the same state the game polls", async () => {
    const id = await newPlayer();
    s.deps.repo.logTurn(id, [], ["c'est combien ?"]);
    const client = new Client({ name: "luna-test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["award_star", "get_missed_phrases", "get_player_summary", "mark_phrase_mastered", "unlock_district"]);

    const missed = await client.callTool({ name: "get_missed_phrases", arguments: { player_id: id } });
    expect(JSON.stringify(missed.content)).toContain("c'est combien ?");

    await client.callTool({ name: "mark_phrase_mastered", arguments: { player_id: id, phrase: "c'est combien ?" } });
    await client.callTool({ name: "unlock_district", arguments: { player_id: id, district: "market" } });
    await client.callTool({ name: "award_star", arguments: { player_id: id, mission_id: "sim_kiosk" } });
    const summary = await client.callTool({ name: "get_player_summary", arguments: { player_id: id } });
    expect(JSON.stringify(summary.content)).toContain("paris");
    await client.close();

    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === "c'est combien ?")?.status).toBe("mastered");
    expect(st.unlocks).toContain("market");
    expect(st.missions.find((m) => m.mission_key === "sim_kiosk")?.stars).toBe(1);
  });
});
