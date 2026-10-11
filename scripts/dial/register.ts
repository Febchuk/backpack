/**
 * Points Dial at our server: a webhook subscription for call.transcribed/call.ended → ${PUBLIC_URL}/dial/webhook,
 * and a Context MCP "Backpack game" → ${PUBLIC_URL}/mcp. Idempotent: keeps an exact match, replaces Backpack
 * entries that point at an older URL.
 *
 * Usage: pnpm exec tsx scripts/dial/register.ts https://<your-tunnel>
 */
import { dialFromEnv, fail, listOf, objectOf } from "./lib";

const EVENT_TYPES = ["call.transcribed", "call.ended"];
const MCP_NAME = "Backpack game";

type Webhook = { id: string; targetUrl?: string; eventTypes?: string[]; secret?: string; signingSecret?: string };
type ContextMcp = { id: string; name?: string; url?: string; authMode?: string; status?: string; authorizationUrl?: string };

const secretOf = (w: unknown): string | undefined => {
  const o = (w ?? {}) as Record<string, unknown>;
  const s = o.secret ?? o.signingSecret ?? o.signing_secret;
  return typeof s === "string" ? s : undefined;
};

function printSecretOnce(secret: string | undefined) {
  if (!secret) return console.log("  (no signing secret in the response: copy it from https://getdial.ai/dashboard/webhooks)");
  console.log("\nPaste this line into .env, then restart the server:\n");
  console.log(`DIAL_WEBHOOK_SECRET=${secret}\n`);
}

async function main() {
  const arg = process.argv[2] ?? process.env.PUBLIC_URL;
  if (!arg) fail("Usage: tsx scripts/dial/register.ts <PUBLIC_URL>  (or set PUBLIC_URL in .env)");
  const base = arg.replace(/\/+$/, "");
  if (!base.startsWith("https://")) fail(`PUBLIC_URL must be https (Dial rejects other targets): ${base}`);
  const webhookUrl = `${base}/dial/webhook`;
  const mcpUrl = `${base}/mcp`;
  const dial = dialFromEnv();

  // 1. Webhook subscription
  const hooks = listOf<Webhook>(await dial("GET", "/v1/webhooks"), "webhooks");
  const same = hooks.find((h) => h.targetUrl === webhookUrl);
  for (const h of hooks) {
    if (h === same || !h.targetUrl?.endsWith("/dial/webhook")) continue;
    await dial("DELETE", `/v1/webhooks/${h.id}`);
    console.log(`Removed old Backpack webhook ${h.id} → ${h.targetUrl}`);
  }
  const sameTypes = same && EVENT_TYPES.every((t) => same.eventTypes?.includes(t) || same.eventTypes?.includes("*"));
  if (same && sameTypes) {
    console.log(`Webhook ${same.id} already points at ${webhookUrl}`);
    if (!process.env.DIAL_WEBHOOK_SECRET) {
      printSecretOnce(secretOf(objectOf(await dial("GET", `/v1/webhooks/${same.id}/secret`), "webhook")));
    } else console.log("  DIAL_WEBHOOK_SECRET is already set in .env");
  } else {
    if (same) {
      await dial("DELETE", `/v1/webhooks/${same.id}`);
      console.log(`Removed webhook ${same.id} (wrong event types)`);
    }
    const created = objectOf<Webhook>(await dial("POST", "/v1/webhooks", { targetUrl: webhookUrl, eventTypes: EVENT_TYPES }), "webhook");
    console.log(`Created webhook ${created.id} → ${webhookUrl} for ${EVENT_TYPES.join(", ")}`);
    printSecretOnce(secretOf(created));
  }

  // 2. Context MCP
  const mcps = listOf<ContextMcp>(await dial("GET", "/v1/context-mcps"), "contextMcps", "context_mcps", "mcps");
  let mcp = mcps.find((m) => m.url === mcpUrl);
  for (const m of mcps) {
    if (m === mcp || m.name !== MCP_NAME) continue;
    await dial("DELETE", `/v1/context-mcps/${m.id}`);
    console.log(`Removed old Context MCP ${m.id} → ${m.url}`);
  }
  if (mcp) console.log(`Context MCP ${mcp.id} already points at ${mcpUrl}`);
  else {
    mcp = objectOf<ContextMcp>(await dial("POST", "/v1/context-mcps", { name: MCP_NAME, url: mcpUrl }), "contextMcp", "context_mcp", "mcp");
    console.log(`Created Context MCP ${mcp.id} → ${mcpUrl}`);
  }
  console.log(`  authMode=${mcp.authMode ?? "?"}  status=${mcp.status ?? "?"}`);
  if (mcp.authorizationUrl) console.log(`  Open to finish OAuth: ${mcp.authorizationUrl}`);
}

main().catch(fail);
