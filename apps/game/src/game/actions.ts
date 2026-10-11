import { MISSION_FOR_NPC, type NpcId, type NpcTurnResponse } from "@backpack/shared";
import { api, pollState } from "../net/api";
import { store } from "../store";
import { ui } from "../ui";

/**
 * Everything the player can do that talks to the server. The UI and the test hooks both call these,
 * so tests exercise the same code path as a real player.
 */

export const NPC_NAMES: Record<NpcId, string> = {
  clerk: "SIM clerk",
  barista: "Barista",
  girard: "M. Girard",
  margaux: "Margaux",
  ines: "Inès",
  theo: "Théo",
};

let stopPolling: (() => void) | null = null;

/** Reuses the stored player if the server still knows it, else creates one. Starts /state polling. */
export async function startSession(): Promise<string> {
  let id = store.playerId();
  if (id) {
    try {
      store.set(await api.getState(id));
    } catch {
      id = null;
    }
  }
  if (!id) {
    const state = await api.createPlayer();
    id = state.player.id;
    store.setPlayerId(id);
    store.set(state);
  }
  stopPolling?.();
  stopPolling = pollState(id, (s) => store.set(s));
  return id;
}

/** Fetches /state now instead of waiting for the next poll. */
export async function refreshState(): Promise<void> {
  const id = store.playerId();
  if (!id) return;
  try {
    store.set(await api.getState(id));
  } catch (e) {
    console.warn("[backpack] refresh failed", e);
  }
}

function requirePlayerId(): string {
  const id = store.playerId();
  if (!id) throw new Error("no player yet: press ENTER on the title screen");
  return id;
}

/** The NPC's mission, unless it is already done (then the turn is open play). */
function missionFor(npcId: NpcId): string | undefined {
  const key = MISSION_FOR_NPC[npcId];
  const mission = store.state?.missions.find((m) => m.mission_key === key);
  return key && mission?.status !== "done" ? key : undefined;
}

/** One NPC turn: thinking indicator → server → dialogue box (and the SIM form when the kiosk is done). */
export async function talk(npcId: NpcId, input: { text?: string; audio?: Blob }): Promise<NpcTurnResponse> {
  const playerId = requirePlayerId();
  const name = NPC_NAMES[npcId];
  ui.dialogue.thinking(name);
  let turn: NpcTurnResponse;
  try {
    turn = await api.npcTurn(npcId, playerId, { ...input, missionKey: missionFor(npcId) });
  } catch (e) {
    ui.dialogue.say(name, "Pardon ? (They didn't catch that. Try again.)", (e as Error).message);
    throw e;
  }
  ui.dialogue.show(name, turn);
  if (npcId === "clerk" && turn.mission_complete === true) ui.phoneForm.show();
  void refreshState();
  return turn;
}

export async function activate(phone: string): Promise<void> {
  await api.activate(requirePlayerId(), phone);
  ui.toast("SIM active! Luna is calling you…");
  await refreshState();
}

export async function skipEvening(): Promise<void> {
  await api.skipEvening(requirePlayerId());
  ui.toast("Evening falls… Luna is calling for your debrief.");
  await refreshState();
}
