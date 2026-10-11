import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CallResponse, NpcTurnResponse, PlayerState } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";

let s: TestServer;
beforeAll(async () => {
  s = await startTestServer();
});
afterAll(() => s.close());

describe("L0 server: every route answers with schema-valid JSON", () => {
  it("GET /health", async () => {
    expect(await (await s.get("/health")).json()).toEqual({ ok: true });
  });

  it("POST /players and GET /state/:id return PlayerState", async () => {
    const created = PlayerState.parse(await (await s.post("/players")).json());
    const res = await s.get(`/state/${created.player.id}`);
    expect(res.status).toBe(200);
    expect(PlayerState.safeParse(await res.json()).success).toBe(true);
  });

  it("POST /npc/:id/turn (text path) returns NpcTurnResponse", async () => {
    const player = PlayerState.parse(await (await s.post("/players")).json());
    const form = new FormData();
    form.set("player_id", player.player.id);
    form.set("text", "bonjour");
    const res = await fetch(`${s.url}/npc/clerk/turn`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(NpcTurnResponse.safeParse(await res.json()).success).toBe(true);
  });

  it("POST /activate and /skip-evening return CallResponse", async () => {
    const player = PlayerState.parse(await (await s.post("/players")).json());
    const id = player.player.id;
    expect(CallResponse.safeParse(await (await s.post("/activate", { player_id: id, phone: "+15550001111" })).json()).success).toBe(true);
    expect(CallResponse.safeParse(await (await s.post("/skip-evening", { player_id: id })).json()).success).toBe(true);
  });

  it("POST /dial/webhook and /dev/reset return ok", async () => {
    expect((await (await s.post("/dial/webhook", {})).json()).ok).toBe(true);
    expect(await (await s.post("/dev/reset")).json()).toEqual({ ok: true });
  });
});
