import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NpcTurnResponse, PlayerState } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { npcTurn } from "../helpers/fakes";

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(() => s.close());

const newPlayer = async () => PlayerState.parse(await (await s.post("/players")).json()).player.id;
const state = async (id: string) => PlayerState.parse(await (await s.get(`/state/${id}`)).json());
const turn = async (npc: string, id: string, text: string) => {
  const res = await npcTurn(s.url, npc, id, text);
  expect(res.status).toBe(200);
  return NpcTurnResponse.parse(await res.json());
};

describe("L1 voice lane (mock Gemini, text path)", () => {
  it("clerk: saying the required phrases completes sim_kiosk and activates cafe_order", async () => {
    const id = await newPlayer();
    const r = await turn("clerk", id, "Bonjour ! Je voudrais une carte SIM, merci.");
    expect(r.mission_complete).toBe(true);
    expect(r.phrases_used).toEqual(expect.arrayContaining(["bonjour", "je voudrais une carte SIM"]));
    expect(r.reply_fr.length).toBeGreaterThan(0);
    const st = await state(id);
    expect(st.missions.find((m) => m.mission_key === "sim_kiosk")?.status).toBe("done");
    expect(st.missions.find((m) => m.mission_key === "cafe_order")?.status).toBe("active");
  });

  it("barista: a missing required phrase is reported, hinted, and logged as missed", async () => {
    const id = await newPlayer();
    const r = await turn("barista", id, "bonjour, je voudrais un cafe");
    expect(r.mission_complete).toBe(false);
    expect(r.phrases_missed).toContain("s'il vous plaît");
    expect(r.hint.length).toBeGreaterThan(0);
    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === "s'il vous plaît")?.status).toBe("missed");
  });

  it("a phrase used on two turns lands in the backpack (mastered)", async () => {
    const id = await newPlayer();
    await turn("clerk", id, "bonjour je voudrais une carte SIM");
    await turn("barista", id, "bonjour je voudrais un café s'il vous plaît");
    const st = await state(id);
    expect(st.phrases.find((p) => p.text_fr === "bonjour")?.status).toBe("mastered");
  });

  it("open-play NPCs return mission_complete: null and still log phrases", async () => {
    const id = await newPlayer();
    const r = await turn("girard", id, "bonjour monsieur");
    expect(r.mission_complete).toBeNull();
    expect((await state(id)).phrases.some((p) => p.text_fr === "bonjour")).toBe(true);
  });

  it("unknown NPC → 404; unknown player → 404", async () => {
    const id = await newPlayer();
    expect((await npcTurn(s.url, "napoleon", id, "bonjour")).status).toBe(404);
    expect((await npcTurn(s.url, "clerk", "p_nope", "bonjour")).status).toBe(404);
  });

  it("audio path accepted in mock mode (no text) and returns a valid turn", async () => {
    const id = await newPlayer();
    const form = new FormData();
    form.set("player_id", id);
    form.set("audio", new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" }), "turn.webm");
    const res = await fetch(`${s.url}/npc/clerk/turn`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(NpcTurnResponse.safeParse(await res.json()).success).toBe(true);
  });

  it("every NPC id has a persona prompt", async () => {
    const { PERSONAS } = await import("../../apps/server/src/npc/personas");
    for (const npc of ["clerk", "barista", "girard", "margaux", "ines", "theo"]) {
      expect(PERSONAS[npc as keyof typeof PERSONAS]?.length).toBeGreaterThan(40);
    }
  });
});
