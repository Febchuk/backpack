import type { DialAdapter, DialCallInput, DialCallRecord } from "../../apps/server/src/adapters/types";

/** A Dial adapter that records every call and SMS so tests can assert on them. */
export function recordingDial() {
  const calls: DialCallInput[] = [];
  const sms: { to: string; body: string }[] = [];
  /** Tests put finished-call transcripts here, keyed by call id, for getCall to return. */
  const records = new Map<string, DialCallRecord>();
  const adapter: DialAdapter = {
    async call(input) {
      calls.push(input);
      return { call_id: `mock_call_${calls.length}` };
    },
    async sms(input) {
      sms.push(input);
      return { id: `mock_sms_${sms.length}` };
    },
    async getCall(callId) {
      const rec = records.get(callId);
      if (!rec) throw new Error(`no record for ${callId}`);
      return rec;
    },
  };
  return { adapter, calls, sms, records };
}

export async function npcTurn(baseUrl: string, npcId: string, playerId: string, text: string, missionKey?: string) {
  const form = new FormData();
  form.set("player_id", playerId);
  form.set("text", text);
  if (missionKey) form.set("mission_key", missionKey);
  return fetch(`${baseUrl}/npc/${npcId}/turn`, { method: "POST", body: form });
}
