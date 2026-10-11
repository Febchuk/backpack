import type { DialAdapter, DialCallInput } from "../../apps/server/src/adapters/types";

/** A Dial adapter that records every call and SMS so tests can assert on them. */
export function recordingDial() {
  const calls: DialCallInput[] = [];
  const sms: { to: string; body: string }[] = [];
  const adapter: DialAdapter = {
    async call(input) {
      calls.push(input);
      return { call_id: `mock_call_${calls.length}` };
    },
    async sms(input) {
      sms.push(input);
      return { id: `mock_sms_${sms.length}` };
    },
  };
  return { adapter, calls, sms };
}

export async function npcTurn(baseUrl: string, npcId: string, playerId: string, text: string, missionKey?: string) {
  const form = new FormData();
  form.set("player_id", playerId);
  form.set("text", text);
  if (missionKey) form.set("mission_key", missionKey);
  return fetch(`${baseUrl}/npc/${npcId}/turn`, { method: "POST", body: form });
}
