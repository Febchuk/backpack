/**
 * Points Dial at the coach: a webhook subscription for message.received/call.ended → ${PUBLIC_URL}/dial/webhook.
 * Idempotent: keeps an exact match. Other `/dial/webhook` subscriptions (an older tunnel, the game's server) are
 * listed and only removed with --replace, since Dial webhooks are account-wide.
 *
 * Usage: pnpm exec tsx scripts/coach/register.ts https://<your-tunnel> [--replace]
 */
import { dialFromEnv, fail, listOf, objectOf } from "../dial/lib";

const EVENT_TYPES = ["message.received", "call.ended"];

type Webhook = { id: string; targetUrl?: string; eventTypes?: string[] };

const secretOf = (w: unknown): string | undefined => {
  const o = (w ?? {}) as Record<string, unknown>;
  const s = o.secret ?? o.signingSecret ?? o.signing_secret;
  return typeof s === "string" ? s : undefined;
};

function printSecretOnce(secret: string | undefined) {
  if (!secret) return console.log("  (no signing secret in the response: copy it from https://getdial.ai/dashboard/webhooks)");
  console.log("\nPaste this line into .env, then restart the coach:\n");
  console.log(`DIAL_WEBHOOK_SECRET=${secret}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const arg = args.find((a) => !a.startsWith("--")) ?? process.env.PUBLIC_URL;
  if (!arg) fail("Usage: tsx scripts/coach/register.ts <PUBLIC_URL> [--replace]  (or set PUBLIC_URL in .env)");
  const base = arg.replace(/\/+$/, "");
  if (!base.startsWith("https://")) fail(`PUBLIC_URL must be https (Dial rejects other targets): ${base}`);
  const webhookUrl = `${base}/dial/webhook`;
  const dial = dialFromEnv();

  const hooks = listOf<Webhook>(await dial("GET", "/v1/webhooks"), "webhooks");
  const same = hooks.find((h) => h.targetUrl === webhookUrl);
  for (const h of hooks) {
    if (h === same || !h.targetUrl?.endsWith("/dial/webhook")) continue;
    if (replace) {
      await dial("DELETE", `/v1/webhooks/${h.id}`);
      console.log(`Removed webhook ${h.id} → ${h.targetUrl}`);
    } else console.log(`Note: webhook ${h.id} → ${h.targetUrl} also receives Dial events (rerun with --replace to remove it)`);
  }

  const sameTypes = same && EVENT_TYPES.every((t) => same.eventTypes?.includes(t) || same.eventTypes?.includes("*"));
  if (same && sameTypes) {
    console.log(`Webhook ${same.id} already points at ${webhookUrl}`);
    if (!process.env.DIAL_WEBHOOK_SECRET) printSecretOnce(secretOf(objectOf(await dial("GET", `/v1/webhooks/${same.id}/secret`), "webhook")));
    else console.log("  DIAL_WEBHOOK_SECRET is already set in .env");
    return;
  }
  if (same) {
    await dial("DELETE", `/v1/webhooks/${same.id}`);
    console.log(`Removed webhook ${same.id} (wrong event types)`);
  }
  const created = objectOf<Webhook>(await dial("POST", "/v1/webhooks", { targetUrl: webhookUrl, eventTypes: EVENT_TYPES }), "webhook");
  console.log(`Created webhook ${created.id} → ${webhookUrl} for ${EVENT_TYPES.join(", ")}`);
  printSecretOnce(secretOf(created));
}

main().catch(fail);
