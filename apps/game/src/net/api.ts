import {
  CallResponse,
  NpcTurnResponse,
  PlayerState,
  routes,
  STATE_POLL_MS,
  type NpcId,
} from "@backpack/shared";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function post<T>(path: string, body: unknown, parse: (x: unknown) => T): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return parse(await res.json());
}

export const api = {
  createPlayer: () => post(routes.players, {}, (x) => PlayerState.parse(x)),
  async getState(playerId: string): Promise<PlayerState> {
    const res = await fetch(API_URL + routes.state(playerId));
    if (!res.ok) throw new Error(`state → ${res.status}`);
    return PlayerState.parse(await res.json());
  },
  async npcTurn(npcId: NpcId, playerId: string, input: { text?: string; audio?: Blob; missionKey?: string }) {
    const form = new FormData();
    form.set("player_id", playerId);
    if (input.missionKey) form.set("mission_key", input.missionKey);
    if (input.text !== undefined) form.set("text", input.text);
    if (input.audio) form.set("audio", input.audio, "turn.webm");
    const res = await fetch(API_URL + routes.npcTurn(npcId), { method: "POST", body: form });
    if (!res.ok) throw new Error(`npc turn → ${res.status}`);
    return NpcTurnResponse.parse(await res.json());
  },
  activate: (player_id: string, phone: string) => post(routes.activate, { player_id, phone }, (x) => CallResponse.parse(x)),
  skipEvening: (player_id: string) => post(routes.skipEvening, { player_id }, (x) => CallResponse.parse(x)),
};

/** Polls /state every STATE_POLL_MS and calls onState. Returns a stop function. */
export function pollState(playerId: string, onState: (s: PlayerState) => void): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      onState(await api.getState(playerId));
    } catch (e) {
      console.warn("[backpack] poll failed", e);
    }
    if (!stopped) setTimeout(tick, STATE_POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
