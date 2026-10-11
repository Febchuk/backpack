/**
 * Read-only check that Luna's Context MCP is wired: Dial has a connection pointing at ${PUBLIC_URL}/mcp,
 * and that URL answers an MCP tools/list with Luna's five tools. Places no calls and sends no SMS.
 *
 * Usage: pnpm exec tsx scripts/dial/check-mcp.ts [PUBLIC_URL]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { dialFromEnv, fail, listOf } from "./lib";

type ContextMcp = { id: string; name?: string; url?: string; authMode?: string; status?: string };
const EXPECTED_TOOLS = ["award_star", "get_missed_phrases", "get_player_summary", "mark_phrase_mastered", "unlock_district"];

async function main() {
  const arg = process.argv[2] ?? process.env.PUBLIC_URL;
  if (!arg) fail("Usage: tsx scripts/dial/check-mcp.ts <PUBLIC_URL>  (or set PUBLIC_URL in .env)");
  const mcpUrl = `${arg.replace(/\/+$/, "")}/mcp`;
  let ok = true;

  const mcps = listOf<ContextMcp>(await dialFromEnv()("GET", "/v1/context-mcps"), "contextMcps", "context_mcps", "mcps");
  const mine = mcps.find((m) => m.url === mcpUrl);
  if (!mine) {
    ok = false;
    console.log(`✗ No Dial Context MCP points at ${mcpUrl}. Run: pnpm exec tsx scripts/dial/register.ts ${arg}`);
    for (const m of mcps) console.log(`    existing: ${m.name ?? "?"} → ${m.url ?? "?"}`);
  } else {
    console.log(`✓ Dial Context MCP ${mine.id} → ${mcpUrl}  authMode=${mine.authMode ?? "?"} status=${mine.status ?? "?"}`);
    if (mine.status && !/connected|active|ready/i.test(mine.status)) console.log("  ! status is not connected: check the Dial dashboard");
  }

  const client = new Client({ name: "backpack-check", version: "0.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    const missing = EXPECTED_TOOLS.filter((t) => !tools.includes(t));
    if (missing.length) {
      ok = false;
      console.log(`✗ ${mcpUrl} is missing tools: ${missing.join(", ")}`);
    } else console.log(`✓ ${mcpUrl} lists ${tools.join(", ")}`);
  } catch (e) {
    ok = false;
    console.log(`✗ ${mcpUrl} did not answer tools/list: ${e instanceof Error ? e.message : e}`);
  } finally {
    await client.close().catch(() => {});
  }

  if (process.env.VOICE_MODE === "selfhosted")
    console.log("! VOICE_MODE=selfhosted: Dial ignores Context MCP; Luna's tools run in the voice bridge instead.");
  process.exit(ok ? 0 : 1);
}

main().catch(fail);
