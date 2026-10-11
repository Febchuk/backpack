import type { NpcTurnInput } from "../adapters/types";
import type { Db } from "../db/db";

/** One past exchange with an NPC: what the player said and what the NPC answered. */
export interface HistoryTurn {
  heard: string;
  reply_fr: string;
}

/** NpcTurnInput plus light NPC memory. The route passes this; the mock ignores `history`. */
export type NpcTurnInputWithHistory = NpcTurnInput & { history?: HistoryTurn[] };

export const HISTORY_TURNS = 3;

/**
 * The player's last `limit` turns with this NPC, oldest first, read from the `npc_turn` game events the route logs.
 * Read-only. TODO(integrator): move into repo.ts as `recentNpcTurns(playerId, npcId, limit)`.
 */
export function recentNpcTurns(db: Db, playerId: string, npcId: string, limit = HISTORY_TURNS): HistoryTurn[] {
  const rows = db
    .prepare(
      `SELECT payload FROM events
       WHERE player_id = ? AND source = 'game'
         AND json_extract(payload, '$.type') = 'npc_turn' AND json_extract(payload, '$.npc') = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(playerId, npcId, limit) as { payload: string }[];
  return rows
    .map((r) => JSON.parse(r.payload).turn as Partial<HistoryTurn> | undefined)
    .filter((t): t is HistoryTurn => typeof t?.heard === "string" && typeof t?.reply_fr === "string")
    .map(({ heard, reply_fr }) => ({ heard, reply_fr }))
    .reverse();
}
