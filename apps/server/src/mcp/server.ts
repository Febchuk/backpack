import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { District, MissionKey } from "@backpack/shared";
import type { Deps } from "../app";
import { lunaTools } from "./tools";

/** Per-request call context. `userNumber` is Dial's `X-Dial-User-Number` (the player's phone on our outbound calls). */
export interface McpCallContext {
  userNumber?: string | null;
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const fail = (error: string) => ({ ...json({ error }), isError: true as const });
const normPhone = (p: string) => p.replace(/[\s\-().]/g, "");

/**
 * Dial sends the header on every call request; on tool discovery it may be missing or an unsubstituted template.
 * Only a value that looks like a phone number counts as present.
 */
export function dialUserNumber(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  return v && /^\+?\d[\d\s\-().]{4,}$/.test(v) ? v : null;
}

/** Luna's tools, over the same repo the game polls. */
export function createLunaMcpServer({ repo }: Deps, ctx: McpCallContext = {}) {
  const server = new McpServer({ name: "backpack-luna", version: "1.0.0" });
  const userNumber = dialUserNumber(ctx.userNumber);

  // With the Dial header, player_id is optional (resolved from the caller's number); without it, it is required.
  // The advertised schema differs per request; handlers are typed for the optional case and resolve() enforces the rest.
  const playerId = (
    userNumber
      ? { player_id: z.string().optional().describe("The player's id. Optional on a call: defaults to the player on the line.") }
      : { player_id: z.string().describe("The player's id") }
  ) as { player_id: z.ZodOptional<z.ZodString> };

  /** Resolves and authorizes the player this request may act on. */
  const resolve = (given: string | undefined): { id: string } | { error: ReturnType<typeof fail> } => {
    if (userNumber) {
      if (given === undefined) {
        const id = repo.playerByPhone(userNumber);
        return id ? { id } : { error: fail("no player is registered for this phone number") };
      }
      const phone = repo.getState(given)?.player.phone;
      if (!phone || normPhone(phone) !== normPhone(userNumber))
        return { error: fail("not authorized: player_id does not belong to the caller") };
      return { id: given };
    }
    if (!given) return { error: fail("player_id is required") };
    return repo.playerExists(given) ? { id: given } : { error: fail(`unknown player ${given}`) };
  };

  server.registerTool(
    "get_player_summary",
    { description: "The player's level, number of missions done, and city.", inputSchema: playerId },
    async ({ player_id }) => {
      const p = resolve(player_id);
      if ("error" in p) return p.error;
      const s = repo.summary(p.id);
      return s ? json(s) : fail(`unknown player ${p.id}`);
    },
  );

  server.registerTool(
    "get_missed_phrases",
    { description: "French phrases the player missed today, newest first.", inputSchema: playerId },
    async ({ player_id }) => {
      const p = resolve(player_id);
      if ("error" in p) return p.error;
      return json(lunaTools.getMissedPhrases(repo, p.id));
    },
  );

  server.registerTool(
    "mark_phrase_mastered",
    {
      description: "Call when the player says a phrase correctly. Moves it into their backpack.",
      inputSchema: { ...playerId, phrase: z.string().min(1).describe("The French phrase, as written") },
    },
    async ({ player_id, phrase }) => {
      const p = resolve(player_id);
      if ("error" in p) return p.error;
      return json(lunaTools.markPhraseMastered(repo, p.id, phrase));
    },
  );

  server.registerTool(
    "award_star",
    {
      description: "Adds a star (max 3) to a mission.",
      inputSchema: { ...playerId, mission_id: z.enum(MissionKey.options).describe("Mission key: sim_kiosk or cafe_order") },
    },
    async ({ player_id, mission_id }) => {
      const p = resolve(player_id);
      if ("error" in p) return p.error;
      repo.awardStar(p.id, mission_id);
      return json({ ok: true, mission_id });
    },
  );

  server.registerTool(
    "unlock_district",
    {
      description: "Opens a district in the game. The only district is market.",
      inputSchema: { ...playerId, district: z.enum(District.options).describe("District name: market") },
    },
    async ({ player_id, district }) => {
      const p = resolve(player_id);
      if ("error" in p) return p.error;
      return json(lunaTools.unlockDistrict(repo, p.id, district));
    },
  );

  return server;
}
