import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../app";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const unknownPlayer = (id: string) => ({ ...json({ error: `unknown player ${id}` }), isError: true });

/** Luna's tools, over the same repo the game polls. */
export function createLunaMcpServer({ repo }: Deps) {
  const server = new McpServer({ name: "backpack-luna", version: "1.0.0" });
  const playerId = { player_id: z.string().describe("The player's id") };

  server.registerTool(
    "get_player_summary",
    { description: "The player's level, number of missions done, and city.", inputSchema: playerId },
    async ({ player_id }) => {
      const s = repo.summary(player_id);
      return s ? json(s) : unknownPlayer(player_id);
    },
  );

  server.registerTool(
    "get_missed_phrases",
    { description: "French phrases the player missed today, newest first.", inputSchema: playerId },
    async ({ player_id }) =>
      repo.playerExists(player_id) ? json({ phrases: repo.missedPhrases(player_id) }) : unknownPlayer(player_id),
  );

  server.registerTool(
    "mark_phrase_mastered",
    {
      description: "Call when the player says a phrase correctly. Moves it into their backpack.",
      inputSchema: { ...playerId, phrase: z.string().describe("The French phrase, as written") },
    },
    async ({ player_id, phrase }) => {
      if (!repo.playerExists(player_id)) return unknownPlayer(player_id);
      repo.markMastered(player_id, phrase);
      return json({ ok: true, phrase, status: repo.phraseStatus(player_id, phrase) });
    },
  );

  server.registerTool(
    "award_star",
    {
      description: "Adds a star (max 3) to a mission.",
      inputSchema: { ...playerId, mission_id: z.string().describe("Mission key, e.g. sim_kiosk or cafe_order") },
    },
    async ({ player_id, mission_id }) => {
      if (!repo.playerExists(player_id)) return unknownPlayer(player_id);
      repo.awardStar(player_id, mission_id);
      return json({ ok: true, mission_id });
    },
  );

  server.registerTool(
    "unlock_district",
    {
      description: "Opens a district in the game, e.g. market.",
      inputSchema: { ...playerId, district: z.string().describe("District name, e.g. market") },
    },
    async ({ player_id, district }) => {
      if (!repo.playerExists(player_id)) return unknownPlayer(player_id);
      repo.unlock(player_id, district);
      return json({ ok: true, district });
    },
  );

  return server;
}
